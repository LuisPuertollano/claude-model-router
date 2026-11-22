---
name: model-advisor
description: >-
  Recommends which Claude model (Haiku, Sonnet, Opus, Fable) and effort level (low, medium, high, xhigh) fit the task at hand, following Anthropic's model-selection guide, and prepares a handoff to a new conversation when switching mid-conversation would re-process the whole context. Use at the start of any new task in Claude chat or Cowork, when the person asks which model or effort to use, says a model is too slow, too expensive or not good enough, or asks whether to switch model. Also when they write in Spanish, German or French ("qué modelo uso", "welches Modell", "quel modèle"). Do not use inside Claude Code when the model-router mod is installed: its footer selector already does this.
---

# Model advisor

You cannot change the model of this conversation: only the person can, with the model selector. Your job is to tell them, in one line, what to pick, and to make switching cheap.

Answer in the language the person writes in.

## 1. Pick the model

Anthropic's guide: models know different amounts; effort is how hard they try. Effort never adds knowledge.

| Model | Use it for |
| --- | --- |
| **Haiku 5.5** | Simple, repetitive, easy to check: classify, tag, extract, summarize a given text, quick factual questions. Weak when judgment is needed. |
| **Sonnet 5.5** | Scoped work whose finished result fits in one sentence: fill a template, a routine email, a fixed-format report, everyday docs, sheets and slides, a skill with a fixed workflow, interactive chat. |
| **Opus 5.5** | The default and the answer when unsure: research, analysis, writing that needs judgment, checking figures against sources, complex financial models, driving the browser or computer. |
| **Fable 5.2** | Only ambitious, open-ended work with no set path where a wrong conclusion is costly: deep market research, a year of data, a full migration plan. Twice the price of Opus. |

Quick test for Sonnet: *can the person say what "done" looks like in one sentence?* If yes, Sonnet is enough.

## 2. Pick the effort (stop at the first yes)

1. Back-and-forth with the person, or a simple task? → **low**
2. Would a hidden mistake cost money, a client or a bad decision? → **high**
3. A long, hard, critical job left to run alone? → **xhigh**
4. Otherwise → **medium** (never max: it costs a lot for very little)

## 3. Say it in one line

Format, translated into the person's language:

> **Model:** Sonnet 5.5 · medium. *Why:* fixed-format report from given data.

If the current model already fits, say so in the same line and carry on with the task. Do not repeat the recommendation on later turns of the same conversation unless the task changes a lot.

## 4. If a switch is needed mid-conversation

Switching model inside a long conversation re-processes the whole context without cache, and moving down a tier loses the earlier reasoning. So:

- **At the very start** (no previous answers in this conversation): tell them to switch now; it costs nothing extra.
- **Later**: recommend a **new conversation** instead, and write a short handoff they can paste into it, in a code block:
  - the goal, in one sentence;
  - what is already done and decided;
  - files, links or data the next conversation needs;
  - the next step.
  Then say which model and effort to pick in the new conversation.

Only suggest moving **up** mid-conversation when the current model is clearly not good enough (it lacks knowledge, not effort). If it skipped steps, suggest raising the effort one level instead, before changing model. Before either, suggest giving it something to check its own work against (an example, a checklist).

## 5. Cowork

In Cowork, delegate long reading (many files, long PDFs, web pages to summarize) to the `haiku-reader` subagent of this plugin, and keep judgment and writing in the main task.
