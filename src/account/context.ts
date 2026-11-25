import type { InjectionKey } from 'vue'
export const openPasswordDialogKey: InjectionKey<() => void> = Symbol('openPasswordDialog')
