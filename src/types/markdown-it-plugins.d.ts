declare module "markdown-it-task-lists" {
  import type MarkdownIt = require("markdown-it");

  interface TaskListOptions {
    enabled?: boolean;
    label?: boolean;
    labelAfter?: boolean;
  }

  const plugin: MarkdownIt.PluginWithOptions<TaskListOptions>;
  export = plugin;
}

declare module "markdown-it-footnote" {
  import type MarkdownIt = require("markdown-it");

  const plugin: MarkdownIt.PluginSimple;
  export default plugin;
}

declare module "markdown-it-mark" {
  import type MarkdownIt = require("markdown-it");

  const plugin: MarkdownIt.PluginSimple;
  export default plugin;
}

declare module "markdown-it-sub" {
  import type MarkdownIt = require("markdown-it");

  const plugin: MarkdownIt.PluginSimple;
  export default plugin;
}

declare module "markdown-it-sup" {
  import type MarkdownIt = require("markdown-it");

  const plugin: MarkdownIt.PluginSimple;
  export default plugin;
}

declare module "markdown-it-emoji" {
  import type MarkdownIt = require("markdown-it");

  export const bare: MarkdownIt.PluginSimple;
  export const light: MarkdownIt.PluginSimple;
  export const full: MarkdownIt.PluginSimple;
}
