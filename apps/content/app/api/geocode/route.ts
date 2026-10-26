import { NextResponse } from "next/server";
import { studioUserFromRequest } from "@/lib/studio-auth";

type GeoResult = {
  label: string;
  address: string;
  postcode: string | null;
  city: string | null;
  latitude: number;
  longitude: number;
};

const UK_POSTCODE = /([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})/i;

function postcodeFrom(address: string) {
  return address.match(UK_POSTCODE)?.[1]?.toUpperCase() ?? null;
}

function cityFrom(address: string, postcode: string | null) {
  const parts = address
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (postcode) {
    const index = parts.findIndex((part) => part.toUpperCase().includes(postcode));
    if (index > 0) return parts[index - 1] ?? null;
  }
  return parts.length > 1 ? (parts[parts.length - 2] ?? null) : null;
}

function component(components: { long_name: string; types: string[] }[] | undefined, type: string) {
  return components?.find((item) => item.types.includes(type))?.long_name ?? null;
}

async function google(path: string, params: Record<string, string>, key: string) {
  const url = new URL(`https://maps.googleapis.com/maps/api/${path}`);
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
  url.searchParams.set("key", key);
  const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error("Google request failed");
  return (await response.json()) as {
    status?: string;
    results?: {
      name?: string;
      formatted_address?: string;
      geometry?: { location?: { lat: number; lng: number } };
      address_components?: { long_name: string; types: string[] }[];
    }[];
  };
}

function rejected(status: string | undefined) {
  if (!status || status === "OK" || status === "ZERO_RESULTS") return null;
  if (status === "REQUEST_DENIED") {
    return "The Google API key was rejected. Enable Places API and Geocoding API for this key.";
  }
  return "Address search was rejected.";
}

export async function GET(request: Request) {
  const studio = await studioUserFromRequest(request);
  if (!studio) {
    return NextResponse.json(
      { results: [], error: "Sign in again to search addresses." },
      { status: 401 },
    );
  }

  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) {
    return NextResponse.json(
      { results: [], error: "Geocoding is not configured." },
      { status: 503 },
    );
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim() ?? "";
  const address = searchParams.get("address")?.trim() ?? "";
  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");

  try {
    if (lat && lng) {
      const data = await google("geocode/json", { latlng: `${lat},${lng}` }, key);
      const message = rejected(data.status);
      if (message) return NextResponse.json({ results: [], error: message }, { status: 502 });
      const first = data.results?.[0];
      return NextResponse.json({
        results: first
          ? [
              {
                label: first.formatted_address ?? "Pinned location",
                address: first.formatted_address ?? "",
                postcode: component(first.address_components, "postal_code"),
                city:
                  component(first.address_components, "postal_town") ??
                  component(first.address_components, "locality"),
                latitude: Number(lat),
                longitude: Number(lng),
              } satisfies GeoResult,
            ]
          : [],
      });
    }

    const text = query || address;
    if (text.length < 2 || text.length > 200) {
      return NextResponse.json({ results: [], error: "Enter a place to search." }, { status: 400 });
    }

    if (address && !query) {
      const data = await google("geocode/json", { address }, key);
      const message = rejected(data.status);
      if (message) return NextResponse.json({ results: [], error: message }, { status: 502 });
      const results = (data.results ?? []).slice(0, 5).flatMap((item) => {
        const latitude = item.geometry?.location?.lat;
        const longitude = item.geometry?.location?.lng;
        if (latitude == null || longitude == null) return [];
        const formatted = item.formatted_address ?? address;
        return [
          {
            label: formatted,
            address: formatted,
            postcode: component(item.address_components, "postal_code") ?? postcodeFrom(formatted),
            city:
              component(item.address_components, "postal_town") ??
              component(item.address_components, "locality"),
            latitude,
            longitude,
          } satisfies GeoResult,
        ];
      });
      return NextResponse.json({ results });
    }

    const data = await google("place/textsearch/json", { query: text }, key);
    const message = rejected(data.status);
    if (message) return NextResponse.json({ results: [], error: message }, { status: 502 });
    const results = (data.results ?? []).slice(0, 5).flatMap((item) => {
      const latitude = item.geometry?.location?.lat;
      const longitude = item.geometry?.location?.lng;
      if (latitude == null || longitude == null) return [];
      const formatted = item.formatted_address ?? item.name ?? text;
      const postcode = postcodeFrom(formatted);
      return [
        {
          label: item.name ? `${item.name} — ${formatted}` : formatted,
          address: formatted,
          postcode,
          city: cityFrom(formatted, postcode),
          latitude,
          longitude,
        } satisfies GeoResult,
      ];
    });
    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ results: [], error: "Address search failed." }, { status: 502 });
  }
}
