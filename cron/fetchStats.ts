import { getPlayerDataThrottled } from './slippi'
import { GoogleSpreadsheet } from 'google-spreadsheet';
//import creds from '../secrets/creds.json';
import * as syncFs from 'fs';
import * as path from 'path';
import util from 'util';
import dotenv from 'dotenv';
import * as settings from '../settings';
import { exec } from 'child_process';

const fs = syncFs.promises;
const execPromise = util.promisify(exec);
dotenv.config({path: ".env.local"})
const creds = {
  "type": "service_account",
  "project_id": "charged-kiln-189218",
  "private_key_id": process.env.GOOGLE_PRIVATE_KEY_ID,
  "private_key": process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  "client_email": process.env.GOOGLE_CLIENT_EMAIL,
  "client_id": process.env.GOOGLE_CLIENT_ID,
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/in-slippi-leaderboard%40charged-kiln-189218.iam.gserviceaccount.com"
}

const getPlayerConnectCodes = async (): Promise<string[]> => {
  const doc = new GoogleSpreadsheet(settings.spreadsheetID);
  await doc.useServiceAccountAuth(creds);
  await doc.loadInfo(); // loads document properties and worksheets
  const sheet = doc.sheetsByIndex[0];
  const rows = (await sheet.getRows()).slice(1); // remove header row
  return [...new Set(rows.map((r) => r._rawData[1]).filter(r => r !== ''))] as string[]
};

const getPlayers = async () => {
  const codes = await getPlayerConnectCodes()
  console.log(`Found ${codes.length} player codes`)
  const allData = codes.map(code => getPlayerDataThrottled(code))
  const results = await Promise.all(allData.map(p => p.catch(e => e)));
  const validResults = results.filter(result => !(result instanceof Error));
  const unsortedPlayers = validResults
    .filter((data: any) => data?.data?.getConnectCode?.user)
    .map((data: any) => data.data.getConnectCode.user);
  return unsortedPlayers.sort((p1, p2) =>
    p2.rankedNetplayProfile.ratingOrdinal - p1.rankedNetplayProfile.ratingOrdinal)
}

async function main() {
  console.log('Starting player fetch.');
  const players = await getPlayers();
  if(!players.length) {
    console.log('Error fetching player data. Terminating.')
    return
  }
  console.log('Player fetch complete.');
  // rename original to players-old
  const newFile = path.join(__dirname, 'data/players-new.json')
  const oldFile = path.join(__dirname, 'data/players-old.json')
  const timestamp = path.join(__dirname, 'data/timestamp.json')

  await fs.rename(newFile, oldFile)
  console.log('Renamed existing data file.');
  await fs.writeFile(newFile, JSON.stringify(players));
  await fs.writeFile(timestamp, JSON.stringify({updated: Date.now()}));
  console.log('Wrote new data file and timestamp.');
  // const rootDir = path.normalize(path.join(__dirname, '..'))
  // console.log(rootDir)
  // if no current git changes
  // const { stdout, stderr } = await execPromise(`git -C ${rootDir} status --porcelain`);
  // if(stdout || stderr) {
  //   console.log('Pending git changes... aborting deploy');
  //   return
  // }
  // console.log('Deploying.');
  // const { stdout: stdout2, stderr: stderr2 } = await execPromise(`npm run --prefix ${rootDir} deploy`);
  // console.log(stdout2);
  // if(stderr2) {
  //   console.error(stderr2);
  // }
  // console.log('Deploy complete.');
}

main();