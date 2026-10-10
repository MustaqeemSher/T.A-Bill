/* T.A. Bill PDF generator — draws the Sayyed Engineers Limited form as a real vector PDF (jsPDF).
   Works in the browser and in Node (for testing). */
(function (root) {
  'use strict';

  // ---------- helpers ----------
  function fmtDate(iso) {
    if (!iso) return '';
    var p = String(iso).split('-');
    return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : String(iso);
  }
  function fmtTime(t) {
    if (!t) return '';
    var p = String(t).split(':');
    var h = parseInt(p[0], 10), m = parseInt(p[1], 10);
    if (isNaN(h) || isNaN(m)) return String(t);
    var ap = h >= 12 ? 'PM' : 'AM';
    var hh = ((h + 11) % 12) + 1;
    return hh + ':' + (m < 10 ? '0' : '') + m + ' ' + ap;
  }
  function toCents(v) {
    var n = parseFloat(v);
    return isNaN(n) ? 0 : Math.round(n * 100);
  }
  function withCommas(n) {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  var ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven',
    'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  var TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  function below100(n) { return n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : ''); }
  function below1000(n) {
    var h = Math.floor(n / 100), r = n % 100;
    return (h ? ONES[h] + ' Hundred' + (r ? ' ' : '') : '') + (r ? below100(r) : '');
  }
  function intToWords(n) {
    if (n === 0) return 'Zero';
    var parts = [];
    var cr = Math.floor(n / 1e7); n %= 1e7;
    var lk = Math.floor(n / 1e5); n %= 1e5;
    var th = Math.floor(n / 1e3); n %= 1e3;
    if (cr) parts.push(intToWords(cr) + ' Crore');
    if (lk) parts.push(below100(lk) + ' Lakh');
    if (th) parts.push(below100(th) + ' Thousand');
    if (n) parts.push(below1000(n));
    return parts.join(' ');
  }
  function amountInWords(cents) {
    var r = Math.floor(cents / 100), p = cents % 100;
    return intToWords(r) + (p ? ' and ' + intToWords(p) + ' Paisa' : '') + ' Only';
  }

  // ---------- layout constants (mm, A4 portrait) ----------
  var COL = [8, 33.2, 50.4, 68.9, 173.8, 193.8, 201.8]; // table column edges
  var L = COL[0], R = COL[6];
  var TOP = 54, HEAD = 11, BODY_TOP = TOP + HEAD;
  var MINROW = 9.5, MINROWS = 15, CAP = MINROW * MINROWS, BODY_BOT = BODY_TOP + CAP;
  var LH = 4.3, FS = 9.5;
  var DA_AREA = 20.5, TOTAL_H = 9.5;

  function buildTABillPDF(jsPDF, bill) {
    var doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    doc.setProperties({ title: 'T.A. Bill - ' + (bill.name || ''), author: 'Sayyed Engineers Limited' });

    var entries = (bill.rows || []).filter(function (r) {
      return r && (r.date || r.time || r.kind || r.particulars || r.amount);
    });

    // measure rows (text wraps, row grows automatically)
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(FS);
    // wrap text; also hard-breaks very long unbroken words so nothing overflows the column
    function wrap(text, maxW) {
      var out = [];
      doc.splitTextToSize(String(text || ''), maxW).forEach(function (ln) {
        while (doc.getTextWidth(ln) > maxW && ln.length > 1) {
          var k = ln.length;
          while (k > 1 && doc.getTextWidth(ln.slice(0, k)) > maxW) k--;
          out.push(ln.slice(0, k)); ln = ln.slice(k);
        }
        out.push(ln);
      });
      return out;
    }
    var measured = entries.map(function (r) {
      var lines = wrap(r.particulars, COL[4] - COL[3] - 4);
      if (!lines.length) lines = [''];
      return { r: r, lines: lines, h: Math.max(MINROW, lines.length * LH + 4) };
    });

    // paginate
    var pages = [[]], used = 0;
    measured.forEach(function (m) {
      var cur = pages[pages.length - 1];
      if (used + m.h > CAP + 0.001 && cur.length) { pages.push([]); used = 0; cur = pages[pages.length - 1]; }
      cur.push(m); used += m.h;
    });

    // totals
    var rowsCents = entries.reduce(function (s, r) { return s + toCents(r.amount); }, 0);
    var daCents = Math.round((parseFloat(bill.da_days) || 0) * toCents(bill.da_rate));
    var totalCents = rowsCents + daCents;

    function fit(text, maxW, size, minSize) {
      doc.setFontSize(size);
      while (doc.getTextWidth(text) > maxW && size > minSize) { size -= 0.5; doc.setFontSize(size); }
    }
    function field(label, lx, lineX1, lineX2, y, value) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5);
      doc.text(label, lx, y);
      doc.setLineWidth(0.25); doc.line(lineX1, y + 0.8, lineX2, y + 0.8);
      if (value) {
        doc.setFont('helvetica', 'normal');
        fit(String(value), lineX2 - lineX1 - 2, 10, 6.5);
        doc.text(String(value), lineX1 + 1.5, y - 0.6);
      }
    }
    function moneyCells(cents, xRs, xPs, y) {
      var rs = Math.floor(cents / 100), ps = cents % 100;
      doc.text(withCommas(rs), xRs, y, { align: 'right' });
      doc.text((ps < 10 ? '0' : '') + ps, xPs, y, { align: 'center' });
    }

    pages.forEach(function (items, pi) {
      if (pi > 0) doc.addPage();
      var isLast = pi === pages.length - 1;
      var tableBottom = BODY_BOT + DA_AREA;
      doc.setTextColor(0); doc.setDrawColor(0);

      // ----- title block -----
      doc.setFont('helvetica', 'bold'); doc.setFontSize(17);
      doc.text('T.A. BILL', 105, 20, { align: 'center' });
      var tw = doc.getTextWidth('T.A. BILL');
      doc.setLineWidth(0.4); doc.line(105 - tw / 2, 21.3, 105 + tw / 2, 21.3);
      doc.setFont('times', 'bolditalic'); doc.setFontSize(16);
      doc.text('Sayyed Engineers Limited', R, 20, { align: 'right' });

      field('Date', 153.8, 162, R, 28.5, fmtDate(bill.bill_date));
      field('Name', 40.5, 49, 139, 37.5, bill.name);
      field('Designation', 142.3, 162, R, 37.5, bill.designation);

      // purpose (may wrap to two lines)
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5);
      doc.text('Purpose', 16.2, 46.5);
      doc.setLineWidth(0.25); doc.line(29, 47.3, R, 47.3);
      if (bill.purpose) {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
        var pl = wrap(bill.purpose, R - 31).slice(0, 2);
        if (pl.length === 1) doc.text(pl[0], 30.5, 45.9);
        else { doc.text(pl[0], 30.5, 41.9 + 0.3); doc.text(pl[1], 30.5, 45.9); }
      }

      // ----- table frame -----
      doc.setLineWidth(0.4);
      doc.line(L, TOP, R, TOP);
      doc.line(L, BODY_TOP, R, BODY_TOP);
      doc.setLineWidth(0.3);
      for (var c = 1; c <= 5; c++) doc.line(COL[c], TOP, COL[c], tableBottom);
      doc.setLineWidth(0.4);
      doc.line(L, tableBottom, R, tableBottom);

      // headers
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
      doc.text('Date', (COL[0] + COL[1]) / 2, TOP + 6.6, { align: 'center' });
      doc.text('Time', (COL[1] + COL[2]) / 2, TOP + 4.6, { align: 'center' });
      doc.text('AM/PM', (COL[1] + COL[2]) / 2, TOP + 8.8, { align: 'center' });
      doc.text('Departure', (COL[2] + COL[3]) / 2, TOP + 4.4, { align: 'center' });
      doc.setLineWidth(0.2); doc.line(COL[2], TOP + 5.5, COL[3], TOP + 5.5);
      doc.text('Arrival', (COL[2] + COL[3]) / 2, TOP + 9.2, { align: 'center' });
      doc.text('PARTICULARS', (COL[3] + COL[4]) / 2, TOP + 6.6, { align: 'center' });
      doc.text('Amount', (COL[4] + COL[5]) / 2, TOP + 4.4, { align: 'center' });
      doc.text('Rupees', (COL[4] + COL[5]) / 2, TOP + 8.8, { align: 'center' });
      doc.text('Ps.', (COL[5] + COL[6]) / 2, TOP + 6.6, { align: 'center' });

      // ----- rows -----
      var y = BODY_TOP;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(FS);
      doc.setLineWidth(0.15);
      doc.setLineDashPattern([0.4, 0.7], 0);
      items.forEach(function (m) {
        var r = m.r, h = m.h;
        var blockH = m.lines.length * LH;
        var ty = y + (h - blockH) / 2 + LH * 0.75;
        var cy = y + h / 2 + 1.2; // single-line cells, vertically centred
        doc.setLineDashPattern([], 0);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(FS);
        doc.text(fmtDate(r.date), (COL[0] + COL[1]) / 2, cy, { align: 'center' });
        doc.text(fmtTime(r.time), (COL[1] + COL[2]) / 2, cy, { align: 'center' });
        var kind = r.kind === 'dep' ? 'Departure' : r.kind === 'arr' ? 'Arrival' : '';
        doc.setFontSize(8.5);
        doc.text(kind, (COL[2] + COL[3]) / 2, cy, { align: 'center' });
        doc.setFontSize(FS);
        m.lines.forEach(function (ln, i) { doc.text(ln, COL[3] + 2, ty + i * LH); });
        if (r.amount !== '' && r.amount != null && !isNaN(parseFloat(r.amount))) {
          moneyCells(toCents(r.amount), COL[5] - 2, (COL[5] + COL[6]) / 2, cy);
        }
        y += h;
        doc.setLineWidth(0.15); doc.setLineDashPattern([0.4, 0.7], 0);
        doc.line(L, y, R, y);
      });
      // blank ruled rows to fill the page like the printed form
      while (y + MINROW <= BODY_BOT + 0.01) {
        y += MINROW;
        doc.line(L, y, R, y);
      }
      doc.setLineDashPattern([], 0);

      // ----- footer inside table (advance / D.A) -----
      var fy1 = BODY_BOT + 8, fy2 = BODY_BOT + 16;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
      var fx = 77.6;
      if (isLast) {
        doc.text('(Advance Taken Rs.', fx, fy1);
        var ax = fx + doc.getTextWidth('(Advance Taken Rs.') + 1;
        doc.setLineWidth(0.25); doc.line(ax, fy1 + 0.8, ax + 44, fy1 + 0.8);
        doc.text(')', ax + 45.5, fy1);
        if (bill.advance !== '' && bill.advance != null && parseFloat(bill.advance)) {
          doc.setFontSize(9.5);
          doc.text(withCommas(parseFloat(bill.advance).toFixed(2).replace(/\.00$/, '')), ax + 22, fy1 - 0.8, { align: 'center' });
          doc.setFontSize(10);
        }
        doc.text('D.A for', fx, fy2);
        var dx = fx + doc.getTextWidth('D.A for') + 1;
        doc.line(dx, fy2 + 0.8, dx + 27, fy2 + 0.8);
        if (bill.da_days) { doc.setFontSize(9.5); doc.text(String(bill.da_days), dx + 13.5, fy2 - 0.8, { align: 'center' }); doc.setFontSize(10); }
        var d2 = dx + 28;
        doc.text('days @ Rs.', d2, fy2);
        var rx = d2 + doc.getTextWidth('days @ Rs.') + 1;
        doc.line(rx, fy2 + 0.8, rx + 27, fy2 + 0.8);
        if (bill.da_rate) { doc.setFontSize(9.5); doc.text(String(bill.da_rate), rx + 13.5, fy2 - 0.8, { align: 'center' }); doc.setFontSize(10); }
        if (daCents) moneyCells(daCents, COL[5] - 2, (COL[5] + COL[6]) / 2, fy2);
      } else {
        doc.setFont('helvetica', 'italic'); doc.setFontSize(9);
        doc.text('Continued on next page...', fx, fy2);
      }

      // ----- total box -----
      var ty0 = tableBottom;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
      if (isLast) {
        doc.text('Total', COL[4] - 4, ty0 + 6.4, { align: 'right' });
        doc.setLineWidth(0.4);
        doc.rect(COL[4], ty0, COL[6] - COL[4], TOTAL_H);
        doc.setLineWidth(0.3); doc.line(COL[5], ty0, COL[5], ty0 + TOTAL_H);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5);
        moneyCells(totalCents, COL[5] - 2, (COL[5] + COL[6]) / 2, ty0 + 6.4);

        // rupees in words (two ruled lines)
        var wy = ty0 + 6.5;
        doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
        doc.text('Rupees', 13, wy);
        doc.setLineWidth(0.25);
        doc.line(24.5, wy + 0.8, 146.9, wy + 0.8);
        doc.line(25, wy + 11.5, 146.9, wy + 11.5);
        var words = amountInWords(totalCents);
        doc.setFontSize(9.5);
        var wl = doc.splitTextToSize(words, 120);
        doc.text(wl[0] || '', 26, wy - 0.8);
        if (wl[1]) doc.text(wl.slice(1).join(' '), 26, wy + 10.7);
      }

      // ----- signatures (last page only) -----
      if (isLast) {
        var sy = ty0 + 33;
        var sigs = [['Claimant', 13.7, 48.5], ['Approved by', 63.6, 98.4], ['Checked by', 112.5, 147.5], ['Passed for Payment', 164.7, 199.8]];
        doc.setLineWidth(0.25); doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
        sigs.forEach(function (s) {
          doc.line(s[1], sy, s[2], sy);
          doc.text(s[0], (s[1] + s[2]) / 2, sy + 4.6, { align: 'center' });
        });
      }

      if (pages.length > 1) {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(110);
        doc.text('Page ' + (pi + 1) + ' of ' + pages.length, 105, 290, { align: 'center' });
        doc.setTextColor(0);
      }
    });

    return doc;
  }

  root.buildTABillPDF = buildTABillPDF;
  root.TABillUtil = { fmtDate: fmtDate, fmtTime: fmtTime, toCents: toCents, amountInWords: amountInWords, withCommas: withCommas };
  if (typeof module !== 'undefined' && module.exports) module.exports = { buildTABillPDF: buildTABillPDF, amountInWords: amountInWords };
})(typeof window !== 'undefined' ? window : globalThis);
