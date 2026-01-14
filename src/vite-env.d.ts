/// <reference types="vite/client" />

declare module 'monaco-vim' {
  import * as monaco from 'monaco-editor';
  
  export interface VimMode {
    dispose(): void;
  }
  
  export function initVimMode(
    editor: monaco.editor.IStandaloneCodeEditor,
    statusBarNode?: HTMLElement | null
  ): VimMode;
  
  export namespace VimMode {
    export const Vim: {
      defineEx(name: string, shorthand: string, callback: (cm: any, params: any) => void): void;
    };
  }
}
