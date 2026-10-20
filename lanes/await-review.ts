// On every push the `review` check goes red until a round for this head is posted.
import { setReviewCheck } from './review-check.ts';
import { currentPull } from '../gates/pr.ts';

const pull = await currentPull();
await setReviewCheck(pull.head.sha, false, `awaiting adversarial review of ${pull.head.sha.slice(0, 7)}`, `The lead runs \`node lanes/local-review.ts ${pull.number}\` in Claude Code on a laptop, then hands the round in with the post-review workflow.`);
