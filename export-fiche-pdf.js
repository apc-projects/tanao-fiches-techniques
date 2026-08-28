// export-fiche-pdf.js — Exporte une fiche technique A4 monopage en PDF fidèle
// Usage: node export-fiche-pdf.js <input.html> <output.pdf>
const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const input = process.argv[2];
  const output = process.argv[3];
  if (!input || !output) {
    console.error('Usage: node export-fiche-pdf.js <input.html> <output.pdf>');
    process.exit(1);
  }
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage();
  await page.goto('file://' + path.resolve(input), { waitUntil: 'networkidle0' });
  await page.evaluateHandle('document.fonts.ready');
  // preferCSSPageSize:true respecte @page{size:A4;margin:0} du HTML
  await page.pdf({
    path: output,
    printBackground: true,
    preferCSSPageSize: true,
  });
  await browser.close();
  console.log('PDF généré:', output);
})();
