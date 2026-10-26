import { supabase } from "@/lib/supabase";

export type TestimonyWorkspace = "kharis" | "kp2";
export type TestimonyFeatureType = "featured" | "giving";

export interface Testimony {
  name: string;
  branch_name: string | null;
  category: string | null;
  short_description: string | null;
  description: string;
  image_url: string | null;
  is_anonymous: boolean;
}

const SAFE_TESTIMONY_FIELDS = `
  name,
  branch_name,
  category,
  short_description,
  description,
  image_url,
  is_anonymous
`;

const FALLBACK_FEATURED: Testimony[] = [
  {
    name: "Kwame Nyarko",
    branch_name: "Accra",
    category: "Family",
    short_description: "Family and Marriage Reconciliation",
    description:
      "After a difficult season of division in our home, we brought our marriage and family before God in prayer with the church family. Through the teaching of the Word and pastoral counsel, Christ healed old wounds and restored unity, peace, and joy to our household.",
    image_url: null,
    is_anonymous: false,
  },
  {
    name: "Anonymous",
    branch_name: "Northampton",
    category: "Provision",
    short_description: "Housing Testimony",
    description:
      "We were facing an urgent housing deadline with doors closing at every turn. After praying with the church during service, we received an unexpected call that very week approving us for a home even better than what we had applied for. God truly provides for His children.",
    image_url: null,
    is_anonymous: true,
  },
  {
    name: "Kelvin Quakes",
    branch_name: "KP2 Birmingham",
    category: "Salvation",
    short_description: "Encountering Jesus for Myself",
    description:
      "I grew up thinking that being a 'good person' was enough, and I kept God at arm's length because I thought church was just for people who had their lives completely figured out. But one Sunday, a friend invited me to Kharis Church, and the message preached that morning felt like God was speaking directly to my heart. I gave my life to Christ that day, and my life has never been the same.",
    image_url: null,
    is_anonymous: false,
  },
  {
    name: "Melisaa Richards",
    branch_name: "KP2 London",
    category: "Healing",
    short_description: "Peace & Healing in the Storm",
    description:
      "When a family member of mine received a terrifying medical diagnosis last year, fear instantly tried to take over my life. The doctors were uncertain, and the future looked worrying. I reached out to the brethren in KP2 London, and right away, my friends surrounded me with encouragement and prayer. We stood on God's Word together, and to the glory of God, the next set of scans came back completely clear.",
    image_url: null,
    is_anonymous: false,
  },
  {
    name: "Anonymous",
    branch_name: "KP2 Southampton",
    category: "Freedom",
    short_description: "Freedom from Fear and Anxiety",
    description:
      "For years, I was trapped in cycles of fear and heavy anxiety that I couldn't shake on my own, no matter how hard I tried. Every time I thought I was making progress, old patterns and dark thoughts would pull me back under. When I finally came to Kharis Church and shared what I was going through, the Word of God and prayer broke that heaviness off my life. Today I walk in peace and freedom in Christ.",
    image_url: null,
    is_anonymous: true,
  },
  {
    name: "Tolu Igwe",
    branch_name: "KP2 Romford",
    category: "Healing",
    short_description: "Supernatural Strength & Exam Success",
    description:
      "Right in the middle of my GCSEs, I fell severely ill. I could barely study, and anxiety took over. I surrendered my health and my results to God, asking for supernatural strength. Not only did my health bounce back overnight, but I had absolute clarity during the exam papers and came out with top grades across all my subjects.",
    image_url: null,
    is_anonymous: false,
  },
];

/** Featured testimonies from the content studio. */
export async function getTestimonies(
  workspace: TestimonyWorkspace,
  type: TestimonyFeatureType = "featured",
): Promise<Testimony[]> {
  const featureColumn = type === "giving" ? "is_featured_giving" : "is_featured";

  const { data, error } = await supabase
    .from("testimonies")
    .select(SAFE_TESTIMONY_FIELDS)
    .in("workspace", [workspace, "general"])
    .eq("is_published", true)
    .eq(featureColumn, true);

  if (error) {
    console.error(`Failed to load ${workspace} ${type} testimonies:`, error);

    return type === "featured" ? FALLBACK_FEATURED : [];
  }

  const rows = ((data ?? []) as Testimony[]).map((row) =>
    row.is_anonymous ? { ...row, name: "Anonymous" } : row,
  );

  return rows.length > 0 || type !== "featured" ? rows : FALLBACK_FEATURED;
}
