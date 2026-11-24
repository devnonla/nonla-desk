import { message } from 'devnonla-ui'

/** App-wide notices, drawn by devnonla-ui's `message` inside `<App>`. */
export const toast = {
  success: (msg: string) => message.success(msg),
  error: (msg: string) => message.error(msg),
  warning: (msg: string) => message.warning(msg),
  info: (msg: string) => message.info(msg),
}
