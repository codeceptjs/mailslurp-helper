const { expect } = require('chai')
const { output } = require('codeceptjs');
const { MailSlurp: MailSlurpClient } = require('mailslurp-client');

/**
 * Allows to use real emails in end 2 end tests via [MailSlurp service](https://mailslurp.com).
 * Sign up for account at MailSlurp to start.
 * 
 * A helper requires apiKey from MailSlurp to start
 * 
 * ```js
 * helpers: {
 *   MailSlurp: {
 *     apiKey: '<insert api key here>',
 *     require: '@codeceptjs/mailslurp-helper'    
 *   },
 * }
 * ```
 * > Use .env file and environment variables to store sensitive data like API keys
 * 
 * ## Configuration
 * 
 * * `apiKey` (required) -  api key from MailSlurp
 * * `timeout` (default: 10000) - time to wait for emails in milliseconds.
 * 
 */
class MailSlurp {

  constructor(config) {

    const defaults = {
      timeout: 10000,
    };

    this.config = Object.assign(defaults, config);
    if (!this.config.apiKey) {
      throw new Error(`MailSlurp is not configured! Please provide API key to access your account`);
    }
    this.mailslurp = new MailSlurpClient({ apiKey: this.config.apiKey, attribution: 'codeceptjs' });
  }
  
  _before() {
    this.mailboxes = [];
    this.currentMailbox = null;
    this.currentEmail = null;
  }

  async _after() {
    if (!this.mailboxes || !this.mailboxes.length) return;
    await Promise.all(this.mailboxes.map(m => this.mailslurp.deleteInbox(m.id)));
    output.debug(`Removed ${this.mailboxes.length} mailboxes`);
    this.mailboxes = [];
    this.currentMailbox = null;
    this.currentEmail = null;  
  }

  // enterprise API function
  // async haveMultipleMailboxes(num) {
  //   const mailboxes = await this.mailslurp.bulkCreateInboxes(num);
  //   this.mailboxes = this.mailboxes.concat(mailboxes);
  //   this.currentMailbox = this.mailboxes[this.mailboxes.length-1];
  //   return mailboxes.map(m => m.emailAddress);
  // }

  /**
  * Creates a new mailbox. A mailbox will be deleted after a test.
  * Switches to last created mailbox.
  * 
  * ```js
  * const mailbox = await I.haveNewMailbox();
  * ```
  */
  async haveNewMailbox() {
    const inbox = await this.mailslurp.createInbox();
    inbox.toString = () => inbox.emailAddress;
    this.mailboxes.push(inbox);
    this.currentMailbox = inbox;
    return inbox;
  }

  /**
  * Change a current mailbox to a provided one:
  * 
  * ```js
  * const mailbox1 = await I.haveMailbox();
  * const mailbox2 = await I.haveMailbox();
  * // mailbox2 is now default mailbox
  * // switch back to mailbox1
  * I.openMailbox(mailbox)
  * ``` 
  */
  openMailbox(mailbox) {
    this.currentMailbox = mailbox;
  }


  openEmail(email) {
    this.currentEmail = email;
  }

  /**
  * Sends an email from current mailbox, created by `I.haveNewMailbox()`.
  * 
  * ```js
  * I.sendEmail({
  *   to: ['user@site.com'],
  *   subject: 'Hello',
  *   body: 'World'       
  * });
  * ```
  */
  sendEmail(data) {
    return this.mailslurp.sendEmail(this.currentMailbox.id, data);
  }


  /**
   * Waits for the first email in mailbox.
   * If mailbox is not empty - opens the last email.
   * 
   * ```js
   * I.waitForLatestEmail()
   * // wait for 30 seconds for an email
   * I.waitForLatestEmail(30);
   * ```
   * 
   * @param {num} [sec] Number of seconds to wait.
   * @returns {Promise<Email>} an email received.
   */
  async waitForLatestEmail(sec) {
    if (sec) sec = 1000*sec;    
    const email = await this.mailslurp.waitForLatestEmail(this.currentMailbox.id, sec || this.config.timeout);
    printEmailDebug(email);
    this.currentEmail = email;
    return email;
  }

  /**
   * Wait for an exact email matched by query. You can match emails by `from`, `to`, `subject`, `cc`, `bcc` fields.
   * My default, non-strcit matching enabled, so it searches for inclusion of a string. For a strict matching (equality) 
   * prepend a value with `=` prefix.
   * 
   * ```js
   *  // wait for email with 'password' in subject
   * const email = await I.waitForEmailMatching({
   *  subject: 'password',
   * });
   * 
   * // wait 30 seconds for email with exact subject
   * const email = await I.waitForEmailMatching({
   *  subject: '=Forgot password',
   * }, 30);
   * 
   * // 
   * const email = await I.waitForEmailMatching({
   *  from: '@mysite.com', // find anything from mysite
   *  subject: 'Restore password', // with Restore password in subject
   * });
   * ```
   * @param {object} query to locate an email 
   * @param {num} [sec] Number of seconds to wait.
   * @returns {Promise<Email>} an email received.
   */
  async waitForEmailMatching(query, sec) {
    if (sec) sec = 1000*sec;
    const emailPreviews = await this.mailslurp.waitForMatchingEmails(
      matchEmailBy(query),
      1, 
      this.currentMailbox.id,
      sec || this.config.timeout
    );
    const email = await this.mailslurp.getEmail(emailPreviews[0].id);
    printEmailDebug(email);
    this.currentEmail = email;
    return email;
  }

  /**
  * Wait for exact number of emails in mailbox. Returns the last email in the list.
  * 
  * ```js
  * // wait for 2 emails
  * I.waitForNthEmail(2);
  * // wait for 5 emails for 60 seconds
  * I.waitForNthEmail(5, 60);
  * // wait for 2 emails and return the last one
  * const email = await I.waitForNthEmail(2); 
  * ```
  */
  async waitForNthEmail(number, sec) {
    if (sec) sec = 1000*sec;
    const email = await this.mailslurp.waitForNthEmail(this.currentMailbox.id, number, sec || this.config.timeout);
    this.currentEmail = email;
    printEmailDebug(email);
    this.currentEmail = email;
    return email;
  }

  /**
   * Returns a bunch of emails matched by query. 
   * Similar to `waitForEmailMatching` but returns an array of emails.
   * 
   * ```js
   * // return 2 emails from 'user@user.com'
   * const emails = await I.grabEmailsMatching({ from: 'user@user.com'}, 2);
   * ```
   * @param {object} query to locate an email 
   * @param {num} [num] Number of emails to return.
   * @returns {Promise<[Email]>} emails matching criteria.
   */
  async grabEmailsMatching(query, num) {
    const emailPreviews = await this.mailslurp.waitForMatchingEmails(
      matchEmailBy(query),
      num, 
      this.currentMailbox.id,
      this.config.timeout
    );
    output.debug(`Received ${emailPreviews.length} emails`);
    return Promise.all(emailPreviews.map(e => this.mailslurp.getEmail(e.id)));
  }

  /**
   * Returns all emails from a mailbox.
   * 
   * ```js
   * const emails = await I.grabAllEmailsFromMailbox();
   * ```
   * @returns {Promise<[Email]>} emails.
   */
  async grabAllEmailsFromMailbox() {
    const emailPreviews = await this.mailslurp.getEmails(this.currentMailbox.id);
    output.debug(`Received ${emailPreviews.length} emails`);
    return Promise.all(emailPreviews.map(e => this.mailslurp.getEmail(e.id)));
  }

  /**
  * Checks that current email subject contains a text.
  * 
  * ```js
  * I.seeInEmailSubject('Restore password');
  * ```
  * 
  * Requires an opened email. Use either `waitForEmail*` methods to open. Or open manually with `I.openEmail()` method.
  */ 
  seeInEmailSubject(text) {
    this._hasCurrentEmail();
    const email = this.currentEmail;
    expect(email.subject).to.contain(text, `email subject to contain ${text}`);
  }

  /**
  * Checks that current email subject does not contain a text.
  * 
  * ```js
  * I.seeInEmailSubject('Restore password');
  * ```
  * 
  * Requires an opened email. Use either `waitForEmail*` methods to open. Or open manually with `I.openEmail()` method.
  */
  dontSeeInEmailSubject(text) {
    this._hasCurrentEmail();
    const email = this.currentEmail;
    expect(email.subject).not.to.contain(text, `email subject not to contain ${text}`);
  }

  /**
  * Checks that current email body contains a text.
  * 
  * ```js
  * I.seeInEmailBody('Click link');
  * ```
  * 
  * Requires an opened email. Use either `waitForEmail*` methods to open. Or open manually with `I.openEmail()` method.
  */   
  seeInEmailBody(text) {
    this._hasCurrentEmail();
    const email = this.currentEmail;
    expect(email.body).to.contain(text, `email body to contain ${text}`);
  }

  /**
  * Checks that current email body does not contain a text.
  * 
  * ```js
  * I.dontSeeInEmailBody('Click link');
  * ```
  * 
  * Requires an opened email. Use either `waitForEmail*` methods to open. Or open manually with `I.openEmail()` method.
  */    
  dontSeeInEmailBody(text) {
    this._hasCurrentEmail();
    const email = this.currentEmail;
    expect(email.body).not.to.contain(text, `email body not to contain ${text}`);
  }

  /**
  * Checks that email is from a specified address.
  * 
  * ```js
  * I.seeEmailIsFrom('user@user.com');
  * ```
  * 
  * Requires an opened email. Use either `waitForEmail*` methods to open. Or open manually with `I.openEmail()` method.
  */
  seeEmailIsFrom(text) {
    this._hasCurrentEmail();
    const email = this.currentEmail;
    expect(email.from).to.contain(text, `email from to contain ${text}`);
  }

  /**
  * Checks that current email subject equals to text.
  * 
  * ```js
  * I.seeEmailSubjectEquals('Restore password');
  * ```
  * 
  * Requires an opened email. Use either `waitForEmail*` methods to open. Or open manually with `I.openEmail()` method.
  */   
  seeEmailSubjectEquals(text) {
    this._hasCurrentEmail();
    const email = this.currentEmail;
    expect(email.subject).to.eql(text, `email subject to equal ${text}`);
  }

  /**
  * Checks that current email subject doesn't equal to text.
  * 
  * ```js
  * I.dontSeeEmailSubjectEquals('Restore password');
  * ```
  * 
  * Requires an opened email. Use either `waitForEmail*` methods to open. Or open manually with `I.openEmail()` method.
  */   
  dontSeeEmailSubjectEquals(text) {
    this._hasCurrentEmail();
    const email = this.currentEmail;
    expect(email.subject).not.to.eql(text, `email subject not to equal ${text}`);

  }

  _hasCurrentEmail() {
    if (!this.currentEmail) throw new Error('No email opened. Open an email with waitForEmail* methods');
  }
}

function printEmailDebug(email) {
  output.debug(`Received email from ${email.from} with ${email.subject}`);
}

function matchEmailBy(options) {
  return { matches: Object.entries(options).map(([key, value]) => {
    if (value[0] === '=') {
      return {
        field: key.toUpperCase(),
        value,
        should: 'EQUAL'
      }
    }
    return {
      field: key.toUpperCase(),
      value: value,
      should: 'CONTAIN'
    }
  })};
}

module.exports = MailSlurp;
