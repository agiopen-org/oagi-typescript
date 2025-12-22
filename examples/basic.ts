import {
  DefaultAgent,
  ScreenshotMaker,
  DefaultActionHandler,
} from '@oagi/oagi';

async function main() {
  const agent = new DefaultAgent(process.env.OAGI_API_KEY);
  await agent.execute(
    "Go to Google.com, search timer, add 1 minute by clicking on the '+1:00', and start the timer",
    new DefaultActionHandler(),
    new ScreenshotMaker(),
  );
}

main();
