import { Actor, DefaultActionHandler, ScreenshotMaker } from '@oagi/oagi';

async function main() {
  const actor = new Actor();
  actor.initTask('Complete the form');
  const image_provider = new ScreenshotMaker();
  const action_handler = new DefaultActionHandler();

  for (let i = 0; i < 10; ++i) {
    const image = await image_provider.provide();
    const step = await actor.step(image);

    if (step.stop) break;

    await action_handler.handle(step.actions);
  }
}

main();
