/** Whose name goes under a new story: this device's narrator, created on first use. */
export async function signerFor(anonymous: boolean, me: string | undefined, newName: string, setMyName: () => Promise<string>): Promise<string | undefined> {
  if (anonymous) return undefined;
  if (me) return me;
  if (!newName.trim()) throw new Error('Напишите, как вас подписывать в этой книге, или выберите «Анонимно».');
  return setMyName();
}
