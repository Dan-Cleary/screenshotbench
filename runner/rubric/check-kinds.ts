/**
 * Library of declarative check kinds. A rubric file is a list of categories,
 * each containing a list of checks. Each check picks one kind and supplies
 * its arguments. The rubric runner renders the generated component in a
 * headless browser and dispatches each check against the rendered DOM.
 *
 * Adding a kind: add a discriminated-union arm here, then handle it in
 * `run-checks.ts`. Keep kinds narrow and composable rather than baking in
 * reference-specific logic.
 */
export type CheckKind =
  | { kind: "containsText"; text: string; caseSensitive?: boolean }
  | {
      kind: "elementCount";
      selector: string;
      min?: number;
      max?: number;
      exact?: number;
    }
  | { kind: "headingExists"; level: 1 | 2 | 3; textIncludes?: string }
  | {
      kind: "hasRealControl";
      role: "button" | "textbox" | "link" | "checkbox" | "radio";
      min?: number;
    }
  | { kind: "labeledInputs"; min?: number }
  | {
      kind: "computedColorMatches";
      selector: string;
      property: "color" | "backgroundColor" | "borderColor";
      hue?: { min: number; max: number };
      mode?: "any" | "all";
    }
  | {
      kind: "anyColorMatches";
      selector: string;
      properties: ("color" | "backgroundColor" | "borderColor")[];
      hue: { min: number; max: number };
    }
  | {
      kind: "cardsAlignedInRow";
      selector: string;
      minCount: number;
      width?: number;
      yToleranceFraction?: number;
    }
  | {
      kind: "tiersByTextCount";
      tierNames: string[];
      minMatched?: number;
    }
  | {
      kind: "tiersByTextAligned";
      tierNames: string[];
      minMatched?: number;
      width?: number;
      yToleranceFraction?: number;
    }
  | {
      kind: "noHorizontalScrollAt";
      width: number;
    }
  | {
      kind: "minFontSize";
      minPx: number;
    }
  | {
      kind: "stacksAtMobile";
      selector: string;
      width: number;
    }
  | {
      kind: "hoverChangesStyle";
      selector: string;
    }
  | {
      kind: "clickTogglesState";
      selector: string;
    };

export type Check = CheckKind & { id: string; label: string };

export type Category = {
  key: "L" | "C" | "M" | "I";
  label: string;
  checks: Check[];
};

export type Rubric = {
  version: string;
  referenceSlug: string;
  categories: Category[];
};
