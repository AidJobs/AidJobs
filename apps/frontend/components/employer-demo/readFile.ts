/** Reads a job description file in the browser: plain text, Word (.docx), or PDF. Nothing is uploaded. */

export const ACCEPTED = '.txt,.docx,.pdf,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const MAX_BYTES = 10 * 1024 * 1024;

export type ReadResult = { text: string; error?: undefined } | { text?: undefined; error: string };

export async function readJobFile(file: File): Promise<ReadResult> {
  const name = file.name.toLowerCase();
  if (file.size > MAX_BYTES) return { error: 'This file is larger than 10 MB. Paste the text instead.' };
  try {
    if (name.endsWith('.txt') || file.type === 'text/plain') return { text: await file.text() };
    if (name.endsWith('.docx')) {
      const mammoth = await import('mammoth');
      const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
      return value.trim() ? { text: value } : { error: 'No text was found in this Word file.' };
    }
    if (name.endsWith('.pdf')) {
      const { extractText, getDocumentProxy } = await import('unpdf');
      const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
      const { text } = await extractText(pdf, { mergePages: true });
      return text.trim() ? { text } : { error: 'This PDF looks like a scan (a picture of text), so it cannot be read. Paste the text instead.' };
    }
    if (name.endsWith('.doc')) return { error: 'Older Word files (.doc) cannot be read. Save it as .docx or PDF, or paste the text.' };
  } catch {
    return { error: 'This file could not be read. Paste the text instead.' };
  }
  return { error: 'Choose a text file, a Word file (.docx), or a PDF.' };
}
