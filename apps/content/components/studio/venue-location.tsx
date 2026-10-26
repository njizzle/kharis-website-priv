"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { VenueDraft } from "@/lib/branch-types";
import { getSupabase } from "@/lib/supabase";

type GeoResult = {
  label: string;
  address: string;
  postcode: string | null;
  city: string | null;
  latitude: number;
  longitude: number;
};

async function lookup(params: Record<string, string>) {
  const { data } = await getSupabase().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Sign in again to search addresses.");

  const search = new URLSearchParams(params);
  const response = await fetch(`/api/geocode?${search.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = (await response.json()) as { results?: GeoResult[]; error?: string };
  if (!response.ok) throw new Error(body.error || "Address search failed.");
  return body.results ?? [];
}

export function VenueLocation({
  venue,
  onChange,
}: {
  venue: VenueDraft;
  onChange: (venue: VenueDraft) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeoResult[]>([]);
  const [status, setStatus] = useState("");
  const [pending, setPending] = useState(false);

  const latitude = Number(venue.latitude);
  const longitude = Number(venue.longitude);
  const hasPin =
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    venue.latitude !== "" &&
    venue.longitude !== "";

  async function run(params: Record<string, string>) {
    setPending(true);
    setStatus("");
    try {
      const found = await lookup(params);
      setResults(found);
      if (!found.length) setStatus("No matches.");
    } catch (error) {
      setResults([]);
      setStatus(error instanceof Error ? error.message : "Address search failed.");
    } finally {
      setPending(false);
    }
  }

  async function choose(result: GeoResult) {
    let next = result;
    if (!result.postcode) {
      try {
        const [reversed] = await lookup({
          lat: String(result.latitude),
          lng: String(result.longitude),
        });
        if (reversed)
          next = { ...result, postcode: reversed.postcode, city: result.city ?? reversed.city };
      } catch {
        // The pin is still useful if the postcode lookup fails.
      }
    }
    onChange({
      ...venue,
      address: next.address,
      postcode: next.postcode ?? venue.postcode,
      city: next.city ?? venue.city,
      latitude: String(next.latitude),
      longitude: String(next.longitude),
    });
    setResults([]);
    setQuery("");
  }

  const pad = 0.01;

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={query}
          placeholder="Search for a venue"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              if (query.trim()) void run({ q: query.trim() });
            }
          }}
        />
        <Button
          variant="outline"
          disabled={pending || !query.trim()}
          onClick={() => void run({ q: query.trim() })}
        >
          {pending ? "Searching…" : "Search"}
        </Button>
        <Button
          variant="outline"
          disabled={pending || !venue.address.trim()}
          onClick={() =>
            void run({
              address: [venue.address, venue.postcode, venue.city].filter(Boolean).join(", "),
            })
          }
        >
          Look up address
        </Button>
      </div>
      {status ? <p className="text-sm text-muted-foreground">{status}</p> : null}
      {results.length ? (
        <ul className="overflow-hidden rounded-md border border-border">
          {results.map((result) => (
            <li key={`${result.latitude}-${result.longitude}-${result.label}`}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm hover:bg-accent"
                onClick={() => void choose(result)}
              >
                {result.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          aria-label="Latitude"
          value={venue.latitude}
          placeholder="Latitude"
          onChange={(event) => onChange({ ...venue, latitude: event.target.value })}
        />
        <Input
          aria-label="Longitude"
          value={venue.longitude}
          placeholder="Longitude"
          onChange={(event) => onChange({ ...venue, longitude: event.target.value })}
        />
      </div>
      {hasPin ? (
        <iframe
          title="Map preview"
          className="h-40 w-full rounded-md border border-border"
          src={`https://www.openstreetmap.org/export/embed.html?bbox=${longitude - pad}%2C${latitude - pad}%2C${longitude + pad}%2C${latitude + pad}&layer=mapnik&marker=${latitude}%2C${longitude}`}
        />
      ) : null}
    </div>
  );
}
