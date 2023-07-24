import { getPlayerDataThrottled } from './slippi';
import { GoogleSpreadsheet } from 'google-spreadsheet';
import { promises } from 'fs';
import { normalize, join } from 'path';
import { promisify } from 'util';
import { spreadsheetID } from '../settings';
import { S3, config } from 'aws-sdk';
import { exec } from 'child_process';

const fs = promises;
const execPromise = promisify(exec);

const getPlayerConnectCodes = async (): Promise<string[]> => {
  const doc = new GoogleSpreadsheet(spreadsheetID);
  
  await doc.useServiceAccountAuth(JSON.parse(process.env.GOOGLE_CREDS));
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
  var players = await getPlayers();
  if(!players.length) {
    console.log('Error fetching player data. Terminating.');
    return;
  }

  config.update({ region: 'us-east-1'});
  var s3 = new S3();

  var newPlayers = Buffer.from(JSON.stringify(players));
  players = undefined;
  global.gc();

  var newData = {
    Bucket: process.env.S3_BUCKET,
    Key: 'players-new.json',
    Body: newPlayers,
    ContentEncoding: 'base64',
    ContentType: 'application/json'
  };

  await s3.upload(newData).promise();
  const newFilePath = join(__dirname, 'data/players-new.json')
  await fs.writeFile(newFilePath, newPlayers);

  newPlayers = undefined;
  global.gc();

  var params = {
    Bucket: process.env.S3_BUCKET,
    Key: 'players-new.json'
  };

  const oldPlayerData = s3.getObject(params).promise();
  var oldPlayers = JSON.stringify(JSON.parse((await oldPlayerData).Body.toString()));

  var oldData = {
    Bucket: process.env.S3_BUCKET,
    Key: 'players-old.json',
    Body: oldPlayers,
    ContentEncoding: 'base64',
    ContentType: 'application/json'
  };

  await s3.upload(oldData).promise();
  const oldFilePath = join(__dirname, 'data/players-old.json');
  await fs.writeFile(oldFilePath, oldPlayers);

  oldPlayers = undefined;
  global.gc();
  
  var timestampData = JSON.stringify({ updated: Date.now() });
  var timestamp = {
    Bucket: process.env.S3_BUCKET,
    Key: 'timestamp.json',
    Body: timestampData,
    ContentEncoding: 'base64',
    ContentType: 'application/json'
  }

  await s3.upload(timestamp).promise();

  const timestampPath = join(__dirname, 'data/timestamp.json')  
  await fs.writeFile(timestampPath, timestampData);

  timestamp = undefined;
  global.gc();

  const rootDir = normalize(join(__dirname, '..'))
  console.log('Deploying.');
  const { stdout: stdout2, stderr: stderr2 } = await execPromise(`npm run --prefix ${rootDir} deploy`);
  console.log(stdout2);
  if(stderr2) {
    console.error(stderr2);
  }
  console.log('Deploy complete.');
}

main();
