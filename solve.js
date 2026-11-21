// Fast drop-in for csv-reader 1.0.0 (make.fun's own CSV reader).
//
// Same answers as csv-reader 1.0.0 on every input, reached a different way:
// the reference walks the text one character at a time, appending one
// character at a time to each field. This reader instead jumps from delimiter
// to delimiter with the engine's native scans (one regex scan per unquoted
// field, indexOf for a quoted field's closing quote, slice for the field in
// between), so a plain field costs a couple of native calls instead of a
// JavaScript step per character. Only the rare paths -- a stray CR inside an
// unquoted field, a quoted field holding a quote, a CR or a line break, junk
// after a closing quote, a quote that never closes -- fall back to per-piece
// work, and even there the pieces are slices, never single characters.
//
// The reading policy, restated from csv-reader 1.0.0 so this file stands
// alone:
//   - a U+FEFF at the very start of the text is dropped;
//   - a record ends at LF or CRLF, and a line left with no characters is no
//     record;
//   - outside a quoted field a CR not followed by LF is dropped (stray_cr);
//   - a field that opens with a quote runs to the next quote that is not
//     doubled, "" inside it is one quote, and each CRLF or lone CR inside it
//     is read as LF; what follows its closing quote, up to the next comma or
//     line break, is appended as it stands (quote_junk, when the field ends);
//     a quote that never closes is a literal character, and the text after it
//     is read again as unquoted (unterminated_quote);
//   - a quote inside an unquoted field is a literal character; fields stay
//     strings, never trimmed or converted;
//   - columns is the first record when header is true, else null; rows holds
//     the records after it (every record when header is false), each padded
//     with "" (short_row, with fields: its field count) or cut (long_row,
//     with extra: the cut fields) to the first record's width;
//   - each error is {code, line, row}, in the order met, a record's
//     short_row or long_row when it ends: line the 1-based line its record
//     starts on, counting every LF, CRLF and lone CR inside quotes, and row
//     its record's index in rows, null for the header.
//
// Pure: no clock, no randomness, no locale, nothing kept from one call to
// the next. Every piece of state below is reset at the top of run().

const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

const LINE_BREAKS = /\r\n|\r|\n/g;
const DELIM = /[,\r\n]/g;

// State shared by the scanners, reset for every run() call. The field
// scanners report through fVal / fEnd / fAdded instead of allocating a
// result object per field.
let text = '';
let n = 0;
let pos = 0;
let line = 1;
let recordLine = 1;
let recordRow = null;
let errors = null;
let fVal = '';
let fEnd = END;
let fAdded = 0;

function pushError(code) {
  errors.push({ code, line: recordLine, row: recordRow });
}

// Reads an unquoted field starting at pos, appending onto `init`.
// One native regex scan finds the next delimiter of any kind (comma, LF,
// or CR), so a plain field costs one scan plus its slice. Sets fVal (the
// field), fEnd (how it ended) and fAdded (characters appended after `init`).
function scanUnquoted(init) {
  let v = init;
  let added = 0;
  for (;;) {
    DELIM.lastIndex = pos;
    const m = DELIM.exec(text);
    if (m === null) {
      const seg = text.slice(pos, n);
      v += seg;
      added += seg.length;
      pos = n;
      fVal = v;
      fEnd = END;
      fAdded = added;
      return;
    }
    const idx = m.index;
    const ch = m[0];
    if (ch === ',') {
      v += text.slice(pos, idx);
      added += idx - pos;
      pos = idx + 1;
      fVal = v;
      fEnd = COMMA;
      fAdded = added;
      return;
    }
    if (ch === '\n') {
      v += text.slice(pos, idx);
      added += idx - pos;
      pos = idx + 1;
      line += 1;
      fVal = v;
      fEnd = LINE_BREAK;
      fAdded = added;
      return;
    }
    // A CR: a line break when LF follows, else a stray one, dropped.
    if (text.charCodeAt(idx + 1) === 10) {
      v += text.slice(pos, idx);
      added += idx - pos;
      pos = idx + 2;
      line += 1;
      fVal = v;
      fEnd = LINE_BREAK;
      fAdded = added;
      return;
    }
    v += text.slice(pos, idx);
    added += idx - pos;
    pushError('stray_cr');
    pos = idx + 1;
  }
}

// Reads a quoted field whose opening quote is at pos. Sets fVal / fEnd /
// fAdded like scanUnquoted; fAdded counts only the junk characters
// appended after the closing quote, never the quoted content itself.
function scanQuoted() {
  const open = pos;
  const openLine = line;
  // Find the closing quote: the first quote not doubled by the next one.
  let q = pos + 1;
  let close = -1;
  for (;;) {
    const idx = text.indexOf('"', q);
    if (idx === -1) break;
    if (text.charCodeAt(idx + 1) === 34) {
      q = idx + 2;
      continue;
    }
    close = idx;
    break;
  }
  if (close === -1) {
    // The quote never closes: it is a literal character, and the text
    // after it is read again as unquoted. The line is put back to the
    // opening line first, as the reference does, so the re-read counts the
    // line breaks inside again from there.
    pos = open + 1;
    line = openLine;
    pushError('unterminated_quote');
    scanUnquoted('"');
    return;
  }
  const raw = text.slice(open + 1, close);
  const hasQuote = raw.indexOf('"') !== -1;
  const hasCR = raw.indexOf('\r') !== -1;
  const hasLF = raw.indexOf('\n') !== -1;
  let value = raw;
  if (hasCR || hasLF) {
    // Each CRLF, lone CR and LF inside the quotes is one line break.
    const breaks = raw.match(LINE_BREAKS);
    if (breaks !== null) line += breaks.length;
    if (hasQuote) value = value.replaceAll('""', '"');
    // CRLF and a lone CR inside quotes are each read as LF.
    value = value.replace(/\r\n?/g, '\n');
  } else if (hasQuote) {
    value = raw.replaceAll('""', '"');
  }
  pos = close + 1;
  if (pos >= n) {
    fVal = value;
    fEnd = END;
    fAdded = 0;
    return;
  }
  const c = text.charCodeAt(pos);
  if (c === 44) {
    pos += 1;
    fVal = value;
    fEnd = COMMA;
    fAdded = 0;
    return;
  }
  if (c === 10) {
    pos += 1;
    line += 1;
    fVal = value;
    fEnd = LINE_BREAK;
    fAdded = 0;
    return;
  }
  if (c === 13 && text.charCodeAt(pos + 1) === 10) {
    pos += 2;
    line += 1;
    fVal = value;
    fEnd = LINE_BREAK;
    fAdded = 0;
    return;
  }
  // What follows the closing quote is appended as it stands, up to the
  // next comma or line break. Any characters it adds are quote_junk.
  scanUnquoted(value);
  if (fAdded > 0) pushError('quote_junk');
}

/** csv-reader 1.0.0's answer for one case's input, {text, header}. */
export function run(input) {
  text = String(input.text);
  const header = input.header === true;
  n = text.length;
  errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  pos = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  line = 1;

  for (;;) {
    // Lines with no characters are no records.
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= n) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let quoted = false;
    do {
      if (text.charCodeAt(pos) === 34) {
        quoted = true;
        scanQuoted();
      } else {
        quoted = false;
        scanUnquoted('');
      }
      fields.push(fVal);
    } while (fEnd === COMMA);

    // A line that held only stray CRs is left with no characters: no
    // record (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
