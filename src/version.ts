import fs from 'fs/promises';

interface VersionInfo {
    buildDate?: string;
    buildSecondsSinceEpoch?: number;
    versionString?: string;
}

export class VersionInformation {
    private static instance: VersionInformation;
    public static get(): VersionInformation {
        return this.instance!;
    }

    private readonly versionInfo: VersionInfo;
    private constructor(versionInfo: VersionInfo) {
        this.versionInfo = versionInfo;
    }

    static async init(filePath: string) {
        try {
            const data = await fs.readFile(new URL(filePath, import.meta.url), 'utf-8');
            const versionInfo = JSON.parse(data) as VersionInfo;
            this.instance = new VersionInformation(versionInfo);
        } catch (e) {
            console.error(`Failed to read version information from ${filePath}, got ${e}`);
            this.instance = new VersionInformation({
                versionString: `${e}`,
                buildDate: "unknown",
                buildSecondsSinceEpoch: 0
            });
        }
        
    }

    getVersionString() {
        return this.versionInfo.versionString;
    }
}
