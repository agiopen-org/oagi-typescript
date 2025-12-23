import {
  AsyncAgentObserver,
  DefaultActionHandler,
  ScreenshotMaker,
  TaskerAgent,
} from '@oagi/oagi';

async function main() {
  const observer = new AsyncAgentObserver();

  const tasker = new TaskerAgent(
    process.env.OAGI_API_KEY,
    process.env.OAGI_BASE_URL ?? 'https://api.agiopen.org',
    'lux-actor-1',
    30,
    0.5,
    undefined,
    undefined,
    observer,
  );

  const taskDescription =
    'Open a web browser and search for information about Python';
  const todos = [
    "Search for 'Python programming language'",
    'Click on the official Python.org website link',
  ];

  tasker.setTask(taskDescription, todos);

  const imageProvider = new ScreenshotMaker();
  const actionHandler = new DefaultActionHandler();

  try {
    const success = await tasker.execute(
      '',
      actionHandler,
      imageProvider,
    );
    console.log(`Tasker success: ${success}`);
  } catch (err) {
    console.error('Error during execution:', err);
  }

  observer.export('html', 'export.html');
  console.log('Execution history exported: export.html');
}

main();
