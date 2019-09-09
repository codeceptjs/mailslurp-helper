require('dotenv').config();
const { expect } = require('chai');
const MailSlurp = require('./index');

let I;

describe('MailSlurp helper', function () {

  this.timeout(0);

  before(() => {
    I = new MailSlurp({ apiKey: process.env.API_KEY});
  });

  beforeEach(async () => I._before());
  afterEach(async () => I._after());

  it('should create an inbox', async () => {
    const mailbox = await I.haveNewMailbox();
    expect(mailbox.id).to.be.a('string');
    expect(mailbox.emailAddress).to.be.a('string');
    expect(mailbox.emailAddress).to.contain('@');
    expect(mailbox.toString()).to.eql(mailbox.emailAddress);
  });

  it('should send and receive an email', async () => {
    const mailbox = await I.haveNewMailbox();
    await I.sendEmail({
      to: [mailbox.emailAddress],
      subject: 'Hello Test',
      body: 'Testing'       
    });
    const email = await I.waitForLatestEmail(50);
    expect(email.body.trim()).to.eql('Testing');
    await I.seeInEmailSubject('Hello');
    await I.seeEmailSubjectEquals('Hello Test');
    await I.seeEmailIsFrom(mailbox.emailAddress);
    await I.seeInEmailBody('Testing');
    await I.dontSeeInEmailBody('Email');
    await I.dontSeeInEmailSubject('Bye');
  });


  it('should send an email', async () => {
    const mailbox = await I.haveNewMailbox();
    await I.sendEmail({
      to: [mailbox.emailAddress],
      subject: 'Hello Test',
      body: 'Testing'       
    });
    await I.sendEmail({
      to: [mailbox.emailAddress],
      subject: 'Another Message',
      body: 'Should be received'       
    });
    const email = await I.waitForEmailMatching({
      subject: 'Hello'
    });
    expect(email.body.trim()).to.eql('Testing');
    await I.seeInEmailSubject('Hello');
    await I.seeEmailSubjectEquals('Hello Test');
  });

});