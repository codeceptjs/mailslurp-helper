import colors from 'chalk';

const styles = {
  error: colors.bgRed.white.bold,
  log: colors.grey,
};

export function debug(msg) {
  console.debug(styles.log(msg));
}

export function error(msg) {
  console.error(styles.error(msg));
}
