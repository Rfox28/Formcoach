export interface RuleFrame {
  hipY: number;
  kneeY: number;
}

export interface RuleOutcome {
  ruleId: string;
  passed: boolean;
  cue: string;
}

export interface Rule {
  id: string;
  check: (frame: RuleFrame) => RuleOutcome;
}

const depthCheck: Rule = {
  id: "depthCheck",
  check: ({ hipY, kneeY }) => {
    // Screen y-coordinates increase downward, so a lower hip has a larger y.
    if (hipY > kneeY) {
      return {
        ruleId: "depthCheck",
        passed: true,
        cue: "Good depth. Hip crease broke below the knee.",
      };
    }
    return {
      ruleId: "depthCheck",
      passed: false,
      cue: "Not quite hitting depth. Drive the hips down until the crease breaks below the top of the knee.",
    };
  },
};

export const rules: Rule[] = [depthCheck];
