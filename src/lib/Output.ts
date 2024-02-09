import colors from 'chalk';

const styles = {
  error: colors.bgRed.white.bold,
  log: colors.grey,
};

export function debug(msg) {
    console.log(styles.log(msg));
  }

export function error(msg) {
console.log(styles.error(msg));
}
