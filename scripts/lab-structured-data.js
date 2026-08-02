const siteOrigin = "https://onium.top";

const typeLabels = {
  experiment: "Experiment",
  debug: "Debug Diary",
  failure: "Failure Museum",
  "source-reading": "Source Reading",
};

const collectionPaths = {
  experiment: "experiments",
  debug: "debug",
  failure: "failures",
  "source-reading": "source-reading",
};

function pageUrl(data) {
  const pagePath = `/${String(data.path || "").replace(/index\.html$/, "")}`;
  return new URL(pagePath, siteOrigin).toString();
}

hexo.extend.filter.register("after_post_render", (data) => {
  if (!data.content_type || !typeLabels[data.content_type]) return data;

  const url = pageUrl(data);
  const datePublished = data.date instanceof Date ? data.date.toISOString() : undefined;
  const dateModified = data.updated instanceof Date
    ? data.updated.toISOString()
    : datePublished;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: data.title,
    description: data.description,
    url,
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": url,
    },
    author: {
      "@type": "Person",
      name: "Oniums",
      url: `${siteOrigin}/about/`,
    },
    isPartOf: {
      "@type": "CollectionPage",
      name: typeLabels[data.content_type],
      url: `${siteOrigin}/${collectionPaths[data.content_type]}/`,
    },
    additionalProperty: [
      { "@type": "PropertyValue", name: "contentType", value: data.content_type },
      { "@type": "PropertyValue", name: "status", value: data.status },
      { "@type": "PropertyValue", name: "evidence", value: data.evidence },
      { "@type": "PropertyValue", name: "privacy", value: data.privacy },
    ],
  };

  if (datePublished) jsonLd.datePublished = datePublished;
  if (dateModified) jsonLd.dateModified = dateModified;

  const serialized = JSON.stringify(jsonLd).replace(/</g, "\\u003c");
  data.content += `\n<script type="application/ld+json">${serialized}</script>\n`;
  return data;
});
