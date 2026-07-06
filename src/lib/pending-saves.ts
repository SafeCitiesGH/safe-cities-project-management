// Client-side registry of in-flight content saves, keyed by fileId.
//
// Saves are debounced and flushed asynchronously when leaving a file, so
// reopening it quickly can fetch content BEFORE the save commits — the editor
// then seeds from the stale copy and the next auto-save overwrites the edit.
// File pages await waitForPendingSave() before fetching to prevent that race.

const pendingSaves = new Map<number, Promise<unknown>>()

export function trackPendingSave(fileId: number, save: Promise<unknown>) {
    const cleanup = () => {
        if (pendingSaves.get(fileId) === tracked) {
            pendingSaves.delete(fileId)
        }
    }
    const tracked = save.then(cleanup, cleanup)
    pendingSaves.set(fileId, tracked)
}

/** Resolves once any in-flight save for the file has settled (or instantly). */
export async function waitForPendingSave(fileId: number) {
    const pending = pendingSaves.get(fileId)
    if (pending) {
        await pending
    }
}
