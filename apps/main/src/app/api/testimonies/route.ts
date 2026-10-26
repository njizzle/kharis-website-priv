import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const CATEGORIES = new Set([
  "Deliverance",
  "Education",
  "Family/Marriage",
  "Finances/Miracle Money",
  "Health/Healing",
  "Housing/Mortgage",
  "Job/Career",
  "Safe Passage/Protection",
  "Salvation",
  "Unusual Favour",
  "Other",
]);

function asString(value: unknown, max: number) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;

    const firstName = asString(body.firstName, 80);
    const preferredName = asString(body.preferredName, 80);
    const lastName = asString(body.lastName, 80);
    const mobile = asString(body.mobile, 40);
    const category = asString(body.category, 80);
    const details = asString(body.details, 8000);
    const anonymous = asString(body.anonymous, 8);

    if (!firstName || !lastName || !category || !details) {
      return NextResponse.json({ error: "Please complete all required fields." }, { status: 400 });
    }

    if (!CATEGORIES.has(category)) {
      return NextResponse.json({ error: "Please choose a valid category." }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      console.error("Missing Supabase server environment variables");

      return NextResponse.json({ error: "Server configuration error." }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const displayName = preferredName || `${firstName} ${lastName}`;

    const shortDescription = details.length > 180 ? `${details.slice(0, 177).trim()}...` : details;

    const { data, error } = await supabase
      .from("testimonies")
      .insert({
        name: displayName,
        phone: mobile || null,

        workspace: "kharis",
        category,

        short_description: shortDescription,
        description: details,

        is_anonymous: anonymous === "Yes",

        // Submission must be reviewed before appearing publicly
        is_published: false,
        is_featured: false,
        is_featured_giving: false,
      })
      .select("id")
      .single();

    if (error) {
      console.error("Supabase testimony insert error:", error);

      return NextResponse.json({ error: "Unable to submit testimony." }, { status: 500 });
    }

    return NextResponse.json(
      {
        success: true,
        id: data.id,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Testimony API error:", error);

    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
