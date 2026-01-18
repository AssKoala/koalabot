import fs from 'fs/promises';

async function generateVersionFile()
{
    const buildDate = new Date(Date.now());
    const buildDateString = `${buildDate.getFullYear()}.${(buildDate.getMonth()+1).toString().padStart(2,'0')}.${buildDate.getDate().toString().padStart(2,'0')}`;
    const secondsFromEpoch = Math.floor(buildDate / 1000);

    const versionString = `${buildDateString}/${secondsFromEpoch}`;

    console.log(`Writing to ${versionFilePath}`);
    await fs.writeFile(versionFilePath, JSON.stringify({
        buildDate: buildDate,
        buildSecondsSinceEpoch: secondsFromEpoch,
        versionString: versionString

    }, null, 4));
    console.log(`..Done!`);
}

const versionFilePath = process.argv[2];

if (!versionFilePath) {
    const errMsg = "Please provide the path to the version file as a command line argument.\n"
                    + " e.g. node scripts/generateVersionFile.js version.json"; 
    console.error(errMsg);
    process.exit(1);
}

generateVersionFile();