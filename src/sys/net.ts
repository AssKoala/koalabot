
export class NetUtils {
    public static async downloadFromUrl(url: string, prompt: string): Promise<Buffer | undefined> {
        try {
            const response = await fetch(url);
            if (response.ok) {
                const buf = Buffer.from(await response.arrayBuffer());
                return buf;   
            }
        } catch {
            return undefined;
        }
    }
}
