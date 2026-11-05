async function getWiki() {
  const res = await fetch('https://hypixel-skyblock.fandom.com/wiki/Farm_Merchant');
  const html = await res.text();
  console.log('Length:', html.length);
  const m = html.match(/class="[^"]*image[^"]*"[^>]*href="([^"]+)"/g);
  console.log('Images:', m);
}
getWiki();
