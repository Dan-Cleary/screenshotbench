import type { Page } from "playwright";
import type { Check } from "./check-kinds.js";

export type CheckResult = {
  id: string;
  label: string;
  passed: boolean;
  detail?: string;
};

export async function runCheck(page: Page, check: Check): Promise<CheckResult> {
  try {
    const result = await dispatch(page, check);
    if (typeof result === "boolean") {
      return { id: check.id, label: check.label, passed: result };
    }
    return {
      id: check.id,
      label: check.label,
      passed: result.passed,
      detail: result.detail,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { id: check.id, label: check.label, passed: false, detail: msg };
  }
}

type CheckOutcome = boolean | { passed: boolean; detail?: string };

async function dispatch(page: Page, check: Check): Promise<CheckOutcome> {
  switch (check.kind) {
    case "containsText": {
      const body = (await page.textContent("body")) ?? "";
      const haystack = check.caseSensitive ? body : body.toLowerCase();
      const needle = check.caseSensitive
        ? check.text
        : check.text.toLowerCase();
      return haystack.includes(needle);
    }
    case "elementCount": {
      const count = await page.locator(check.selector).count();
      const okMin = check.min === undefined || count >= check.min;
      const okMax = check.max === undefined || count <= check.max;
      const okExact = check.exact === undefined || count === check.exact;
      const passed = okMin && okMax && okExact;
      return { passed, detail: `matched ${count} element(s)` };
    }
    case "headingExists": {
      const headings = page.locator(`h${check.level}`);
      const n = await headings.count();
      if (n === 0) return false;
      if (!check.textIncludes) return true;
      for (let i = 0; i < n; i++) {
        const text = (await headings.nth(i).textContent()) ?? "";
        if (text.toLowerCase().includes(check.textIncludes.toLowerCase()))
          return true;
      }
      return false;
    }
    case "hasRealControl": {
      const selector = ROLE_SELECTORS[check.role];
      const count = await page.locator(selector).count();
      return count >= (check.min ?? 1);
    }
    case "labeledInputs": {
      const count = await page.evaluate(() => {
        const inputs = Array.from(
          document.querySelectorAll("input, textarea, select"),
        );
        return inputs.filter((el) => {
          const id = el.getAttribute("id");
          const ariaLabel = el.getAttribute("aria-label");
          const ariaLabelledBy = el.getAttribute("aria-labelledby");
          const wrappedLabel = el.closest("label");
          const linkedLabel = id
            ? document.querySelector(`label[for="${id}"]`)
            : null;
          return !!(
            ariaLabel ||
            ariaLabelledBy ||
            wrappedLabel ||
            linkedLabel
          );
        }).length;
      });
      return count >= (check.min ?? 1);
    }
    case "computedColorMatches": {
      const colors = await page.$$eval(
        check.selector,
        (els, prop) =>
          els
            .slice(0, 50)
            .map((el) => getComputedStyle(el)[prop as "color"] as string),
        check.property,
      );
      if (colors.length === 0) return false;
      const matches = colors.filter((c) => {
        const rgb = parseRgb(c);
        if (!rgb) return false;
        const h = rgbToHue(rgb);
        return h >= check.hue!.min && h <= check.hue!.max;
      });
      return check.mode === "all"
        ? matches.length === colors.length
        : matches.length > 0;
    }
    case "anyColorMatches": {
      const colors = await page.$$eval(
        check.selector,
        (els, args) => {
          const props = args.props as ("color" | "backgroundColor" | "borderColor")[];
          return els.slice(0, 50).flatMap((el) => {
            const style = getComputedStyle(el);
            return props.map((p) => style[p] as string);
          });
        },
        { props: check.properties },
      );
      const matchHue = colors.find((c: string) => {
        const rgb = parseRgb(c);
        if (!rgb) return false;
        const h = rgbToHue(rgb);
        return h >= check.hue.min && h <= check.hue.max;
      });
      const passed = !!matchHue;
      const sample = colors.slice(0, 5).join(", ");
      return {
        passed,
        detail: passed
          ? `matched ${matchHue}`
          : `${colors.length} colors scanned, none in hue [${check.hue.min}-${check.hue.max}]; sample: ${sample}`,
      };
    }
    case "cardsAlignedInRow": {
      await page.setViewportSize({ width: check.width ?? 1280, height: 853 });
      await page.waitForTimeout(150);
      const result = await page.evaluate(
        (args) => {
          const els = Array.from(
            document.querySelectorAll(args.selector),
          ).slice(0, 24);
          const rects = els
            .map((el) => el.getBoundingClientRect())
            .filter((r) => r.width > 50 && r.height > 50);
          if (rects.length < args.minCount) {
            return { matched: rects.length, best: 0 };
          }
          const tol = window.innerHeight * args.tol;
          let best = 0;
          for (let i = 0; i < rects.length; i++) {
            let n = 1;
            for (let j = 0; j < rects.length; j++) {
              if (i === j) continue;
              if (Math.abs(rects[i].top - rects[j].top) <= tol) n++;
            }
            if (n > best) best = n;
          }
          return { matched: rects.length, best };
        },
        {
          selector: check.selector,
          minCount: check.minCount,
          tol: check.yToleranceFraction ?? 0.04,
        },
      );
      const passed = result.best >= check.minCount;
      return {
        passed,
        detail: `matched ${result.matched} candidate(s); largest aligned row = ${result.best} (need ≥${check.minCount})`,
      };
    }
    case "noHorizontalScrollAt": {
      await page.setViewportSize({ width: check.width, height: 800 });
      await page.waitForTimeout(150);
      const result = await page.evaluate(() => {
        const html = document.documentElement;
        const body = document.body;
        const tol = 2;
        const docOverflow =
          Math.max(html.scrollWidth, body.scrollWidth) >
          window.innerWidth + tol;
        let worstChild = 0;
        let offender: string | null = null;
        const els = Array.from(body.querySelectorAll("*"));
        for (const el of els) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          const overflow = r.right - window.innerWidth;
          if (overflow > worstChild) {
            worstChild = overflow;
            offender = (el as HTMLElement).tagName.toLowerCase();
            const cls = (el as HTMLElement).className;
            if (typeof cls === "string" && cls)
              offender += "." + cls.split(/\s+/).slice(0, 2).join(".");
          }
        }
        return { docOverflow, worstChild, offender };
      });
      const fails = result.docOverflow || result.worstChild > 16;
      return {
        passed: !fails,
        detail: fails
          ? `body scrollWidth overflow=${result.docOverflow}; worst child overflow=${result.worstChild.toFixed(0)}px (${result.offender})`
          : "no significant overflow",
      };
    }
    case "minFontSize": {
      const tooSmall = await page.evaluate((min) => {
        const els = Array.from(document.body.querySelectorAll("*"));
        for (const el of els) {
          const text = (el as HTMLElement).innerText?.trim();
          if (!text) continue;
          const size = parseFloat(getComputedStyle(el).fontSize);
          if (size > 0 && size < min) return true;
        }
        return false;
      }, check.minPx);
      return !tooSmall;
    }
    case "stacksAtMobile": {
      await page.setViewportSize({ width: check.width, height: 800 });
      await page.waitForTimeout(150);
      const stacked = await page.evaluate((sel) => {
        const els = Array.from(document.querySelectorAll(sel)).slice(0, 12);
        if (els.length < 2) return null;
        const rects = els.map((el) => el.getBoundingClientRect());
        let sideBySidePairs = 0;
        for (let i = 0; i < rects.length - 1; i++) {
          const a = rects[i];
          const b = rects[i + 1];
          if (a.right > b.left + 10 && a.left < b.right - 10) continue;
          if (Math.abs(a.top - b.top) < 20) sideBySidePairs++;
        }
        return sideBySidePairs === 0;
      }, check.selector);
      return stacked === true;
    }
    case "hoverChangesStyle": {
      const result = await page.evaluate((sel) => {
        const el = document.querySelector(sel) as HTMLElement | null;
        if (!el) return false;
        const sheets = Array.from(document.styleSheets);
        for (const sheet of sheets) {
          let rules: CSSRuleList;
          try {
            rules = sheet.cssRules;
          } catch {
            continue;
          }
          for (const rule of Array.from(rules)) {
            if (rule instanceof CSSStyleRule && rule.selectorText.includes(":hover"))
              return true;
          }
        }
        return false;
      }, check.selector);
      return result;
    }
    case "clickTogglesState": {
      await page.setViewportSize({ width: 1280, height: 853 });
      const before = await page.evaluate(() => document.body.outerHTML);
      const clicked = await page
        .locator(check.selector)
        .first()
        .click({ trial: false, timeout: 1500 })
        .then(() => true)
        .catch(() => false);
      if (!clicked) return false;
      await page.waitForTimeout(250);
      const after = await page.evaluate(() => document.body.outerHTML);
      return before !== after;
    }
  }
}

const ROLE_SELECTORS: Record<string, string> = {
  button: "button, [role='button']",
  textbox: "input:not([type='checkbox']):not([type='radio']):not([type='button']), textarea, [role='textbox']",
  link: "a[href], [role='link']",
  checkbox: "input[type='checkbox'], [role='checkbox']",
  radio: "input[type='radio'], [role='radio']",
};

function parseRgb(s: string): [number, number, number] | null {
  const m = s.match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const parts = m[1].split(",").map((p) => parseFloat(p.trim()));
  if (parts.length < 3) return null;
  if (parts.length === 4 && parts[3] === 0) return null;
  return [parts[0], parts[1], parts[2]];
}

function rgbToHue([r, g, b]: [number, number, number]): number {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0;
  let h: number;
  switch (max) {
    case r:
      h = ((g - b) / d) % 6;
      break;
    case g:
      h = (b - r) / d + 2;
      break;
    default:
      h = (r - g) / d + 4;
  }
  h *= 60;
  if (h < 0) h += 360;
  return h;
}
