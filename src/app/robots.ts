import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = process.env.APP_URL || "http://localhost:3000";
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/spa/", "/treatment/", "/explore", "/supplier-guide", "/list-your-spa"],
        disallow: ["/api/", "/dashboard", "/supplier", "/admin", "/book/", "/login", "/register"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
