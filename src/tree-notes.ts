const A_NOTE_FILES = ["Note1.txt", "Note2.txt", "Note3.txt"] as const;

export type NoteFileName = (typeof A_NOTE_FILES)[number];

const mNoteCache = new Map<string, string>();

export function getNoteFileCount(): number {
  return A_NOTE_FILES.length;
}

export function getNoteFileByIndex(nIndex: number): string {
  return A_NOTE_FILES[nIndex % A_NOTE_FILES.length];
}

export function isValidNoteFile(sFileName: string): sFileName is NoteFileName {
  return (A_NOTE_FILES as readonly string[]).includes(sFileName);
}

export function formatNoteLabel(sFileName: string): string {
  return sFileName.replace(/\.txt$/i, "");
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
