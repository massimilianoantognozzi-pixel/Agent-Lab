const OPEN_TAG = '<proposed_plan>';
const CLOSE_TAG = '</proposed_plan>';

type PlanSegment = { type: 'text' | 'start' | 'plan' | 'end'; text: string };

// Adapted from Codex's line-based plan stream parser. Keep the raw response in model history.
export class ProposedPlanParser {
  private insidePlan = false;
  private detectTag = true;
  private line = '';

  private text(value: string): PlanSegment {
    return { type: this.insidePlan ? 'plan' : 'text', text: value };
  }

  private finishLine(): PlanSegment {
    const line = this.line;
    this.line = '';
    const tag = line.trim();
    if (!this.insidePlan && tag === OPEN_TAG) {
      this.insidePlan = true;
      return { type: 'start', text: '' };
    }
    if (this.insidePlan && tag === CLOSE_TAG) {
      this.insidePlan = false;
      return { type: 'end', text: '' };
    }
    return this.text(line);
  }

  push(chunk: string): PlanSegment[] {
    const segments: PlanSegment[] = [];
    let remainder = chunk;
    while (remainder) {
      const end = remainder.indexOf('\n');
      const part = end < 0 ? remainder : remainder.slice(0, end + 1);
      remainder = end < 0 ? '' : remainder.slice(end + 1);
      if (this.detectTag) {
        this.line += part;
        if (end >= 0) {
          segments.push(this.finishLine());
          continue;
        }
        const tag = this.line.trim();
        if (!OPEN_TAG.startsWith(tag) && !CLOSE_TAG.startsWith(tag)) {
          this.detectTag = false;
          segments.push(this.text(this.line));
          this.line = '';
        }
      } else {
        segments.push(this.text(part));
        this.detectTag = end >= 0;
      }
    }
    return segments;
  }

  finish(): PlanSegment[] {
    const segments: PlanSegment[] = this.line ? [this.finishLine()] : [];
    if (this.insidePlan) {
      segments.push({ type: 'end', text: '' });
    }
    this.insidePlan = false;
    this.detectTag = true;
    return segments;
  }
}

export const extractProposedPlan = (input: string): { text: string; plan: string | undefined } => {
  const parser = new ProposedPlanParser();
  let text = '';
  let plan: string | undefined;
  for (const segment of [...parser.push(input), ...parser.finish()]) {
    if (segment.type === 'start') {
      plan = '';
    } else if (segment.type === 'plan') {
      plan = (plan ?? '') + segment.text;
    } else if (segment.type === 'text') {
      text += segment.text;
    }
  }
  return { text, plan };
};

export const planResponseText = (content: string | readonly { type: string; text?: string }[]) =>
  typeof content === 'string'
    ? content
    : content
        .filter(({ type }) => type === 'text')
        .map(({ text }) => text ?? '')
        .join('');
