async function getSkindex() {
  try {
    const res = await fetch('https://www.minecraftskins.com/skin/14761401/hypixel-farmer-merchant/', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });
    const html = await res.text();
    console.log('HTML len:', html.length);
    const m = html.match(/https?:\/\/[^\s"']+\.png/gi);
    if (m) console.log(m.filter(u => u.includes('skin') || u.includes('download') || u.includes('uploads')));
  } catch(e) { console.log(e); }
}
getSkindex();
