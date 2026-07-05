import { marked } from "marked";

const A_NOTE_FILES = [
  "Note1.md",
  "Note2.md",
  "Note3.md",
  "Note4.md",
  "Note5.md",
  "Note6.md",
  "Note7.md",
  "Note8.md",
  "Note9.md",
  "Note10.md",
  "Note11.md",
  "Note12.md",
  "Note13.md",
  "Note14.md",
  "Note15.md",
  "Note16.md",
  "Note17.md",
  "Note18.md",
  "Note19.md",
  "Note20.md",
] as const;

export type NoteFileName = (typeof A_NOTE_FILES)[number];

const mNoteCache = new Map<string, string>();

marked.setOptions({
  gfm: true,
  breaks: true,
});

export function getNoteFileCount(): number {
  return A_NOTE_FILES.length;
}

export function getNoteFileByIndex(nIndex: number): string {
  return A_NOTE_FILES[nIndex % A_NOTE_FILES.length];
}

export function isValidNoteFile(sFileName: string): sFileName is NoteFileName {
  return (A_NOTE_FILES as readonly string[]).includes(sFileName);
}

export function normalizeNoteFileName(sFileName: string): string | null {
  const sCandidate = sFileName.replace(/\.txt$/i, ".md");
  if (isValidNoteFile(sCandidate)) {
    return sCandidate;
  }

  if (isValidNoteFile(sFileName)) {
    return sFileName;
  }

  return null;
}

export function formatNoteLabel(sFileName: string): string {
  return sFileName.replace(/\.(md|txt)$/i, "");
}

export async function loadNoteText(sFileName: string): Promise<string> {
  const sCached = mNoteCache.get(sFileName);
  if (sCached !== undefined) {
    return sCached;
  }

  const oResponse = await fetch(`/notes/${sFileName}`);
  if (!oResponse.ok) {
    throw new Error(`Failed to load note: ${sFileName}`);
  }

  const sText = await oResponse.text();
  mNoteCache.set(sFileName, sText);
  return sText;
}

export function renderNoteHtml(sMarkdown: string): string {
  return marked.parse(sMarkdown) as string;
}
