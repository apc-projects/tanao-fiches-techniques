// export-pdf.js — Exporte un HTML frontend-slides en PDF multipage avec vérification stricte
// Usage: node export-pdf.js <input.html> <output.pdf>
const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const input = process.argv[2];
  const output = process.argv[3];
  if (!input || !output) {
    console.error('Usage: node export-pdf.js <input.html> <output.pdf>');
    process.exit(1);
  }

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  const page = await browser.newPage();
  const fileUrl = 'file://' + path.resolve(input);
  await page.goto(fileUrl, { waitUntil: 'networkidle0' });
  await page.evaluateHandle('document.fonts.ready');

  // Lire le format de la scène
  const stage = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    const w = parseFloat(cs.getPropertyValue('--stage-w'));
    const h = parseFloat(cs.getPropertyValue('--stage-h'));
    return { w: w || 794, h: h || 1123 };
  });

  await page.setViewport({ width: stage.w, height: stage.h });

  // Compter les slides
  const slideCount = await page.evaluate(() => document.querySelectorAll('.slide').length);
  console.log(`\n=== VÉRIFICATION DES ${slideCount} PAGES ===\n`);

  // Vérifier chaque slide individuellement
  const errors = [];
  for (let i = 0; i < slideCount; i++) {
    const check = await page.evaluate((idx, expectedW, expectedH) => {
      const slides = document.querySelectorAll('.slide');
      const slide = slides[idx];
      
      // Afficher uniquement cette slide
      slides.forEach((s, j) => {
        s.style.display = j === idx ? 'block' : 'none';
        s.style.opacity = j === idx ? '1' : '0';
        s.style.visibility = j === idx ? 'visible' : 'hidden';
      });

      const rect = slide.getBoundingClientRect();
      const hasVScroll = slide.scrollHeight > slide.clientHeight + 2;
      const hasHScroll = slide.scrollWidth > slide.clientWidth + 2;
      
      // Vérifier les éléments qui débordent
      const overflowing = [];
      slide.querySelectorAll('*').forEach(el => {
        if (el.children.length === 0) return;
        const r = el.getBoundingClientRect();
        if (r.right > rect.right + 2 || r.left < rect.left - 2 ||
            r.bottom > rect.bottom + 2 || r.top < rect.top - 2) {
          overflowing.push({
            tag: el.tagName.toLowerCase(),
            text: (el.textContent || '').trim().slice(0, 30),
          });
        }
      });

      return {
        slide: idx + 1,
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        expectedW: expectedW,
        expectedH: expectedH,
        dimensionOK: Math.abs(rect.width - expectedW) < 2 && Math.abs(rect.height - expectedH) < 2,
        overflowV: hasVScroll,
        overflowH: hasHScroll,
        overflowingElements: overflowing.length,
        overflowing: overflowing.slice(0, 5),
      };
    }, i, stage.w, stage.h);

    // Reporter les erreurs
    const slideErrors = [];
    if (!check.dimensionOK) {
      slideErrors.push(`Page ${check.slide}: dimensions ${check.width}x${check.height} ≠ attendu ${check.expectedW}x${check.expectedH}`);
    }
    if (check.overflowV) {
      slideErrors.push(`Page ${check.slide}: overflow vertical détecté`);
    }
    if (check.overflowH) {
      slideErrors.push(`Page ${check.slide}: overflow horizontal détecté`);
    }
    if (check.overflowingElements > 0) {
      slideErrors.push(`Page ${check.slide}: ${check.overflowingElements} élément(s) débordent — ${check.overflowing.map(e => `<${e.tag}>`).join(', ')}`);
    }

    if (slideErrors.length > 0) {
      errors.push(...slideErrors);
      console.log(`❌ Page ${check.slide} — ${slideErrors.length} erreur(s)`);
      slideErrors.forEach(e => console.log(`   ${e}`));
    } else {
      console.log(`✓ Page ${check.slide} — OK (${check.width}x${check.height})`);
    }
  }

  // Bloquer si erreurs
  if (errors.length > 0) {
    console.log(`\n⚠️  ${errors.length} ERREUR(S) TOTALE(S) — Export PDF bloqué.`);
    console.log('\nCorrigez le HTML avant de réexporter.\n');
    await browser.close();
    process.exit(2);
  }

  console.log(`\n=== TOUTES LES PAGES SONT VALIDES — GÉNÉRATION DU PDF ===\n`);

  // Capturer chaque slide pour le PDF
  const pdfPages = [];
  for (let i = 0; i < slideCount; i++) {
    await page.evaluate((idx) => {
      const slides = document.querySelectorAll('.slide');
      slides.forEach((s, j) => {
        s.style.display = j === idx ? 'block' : 'none';
        s.style.opacity = j === idx ? '1' : '0';
        s.style.visibility = j === idx ? 'visible' : 'hidden';
      });
    }, i);
    await new Promise(r => setTimeout(r, 400));
    const screenshot = await page.screenshot({ encoding: 'binary' });
    pdfPages.push(screenshot);
    console.log(`  Page ${i+1}/${slideCount} capturée`);
  }

  // Générer le PDF multipage
  const htmlForPdf = `<!DOCTYPE html><html><head><style>
    @page { size: ${stage.w}px ${stage.h}px; margin: 0; }
    body { margin: 0; }
    .page { width: ${stage.w}px; height: ${stage.h}px; page-break-after: always; }
    img { width: 100%; height: 100%; object-fit: cover; display: block; }
  </style></head><body>${pdfPages.map((img, i) => 
    `<div class="page"><img src="data:image/png;base64,${img.toString('base64')}"></div>`
  ).join('')}</body></html>`;

  await page.setContent(htmlForPdf, { waitUntil: 'load' });
  await page.pdf({
    path: output,
    width: `${stage.w}px`,
    height: `${stage.h}px`,
    printBackground: true,
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
  });

  await browser.close();
  console.log(`\n✅ PDF généré: ${output} (${slideCount} pages)\n`);
})();
