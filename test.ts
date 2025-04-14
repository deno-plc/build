const url = new URL("http://localhost:3000/api/v1/graph/lookup_imports");

url.searchParams.append("module", new URL("../technik-app/frontend/dev.client.tsx", import.meta.url).href);

console.log(url.href);

const res = await fetch(url);

console.log(res.status, res.statusText);
console.log(await res.json());
