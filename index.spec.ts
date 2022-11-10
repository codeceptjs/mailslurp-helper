require('dotenv').config();
import { expect } from 'chai';
import {MailSlurp} from './index';
import fs from 'fs';

let I;

describe('MailSlurp helper', function () {

  beforeAll(() => {
    I = new MailSlurp({ apiKey: process.env.API_KEY});
  });

  beforeEach(async () => I._before());
  afterEach(async () => I._after());

  test('should create an inbox', async () => {
    const mailbox = await I.haveNewMailbox();
    expect(mailbox.id).to.be.a('string');
    expect(mailbox.emailAddress).to.be.a('string');
    expect(mailbox.emailAddress).to.contain('@');
    expect(mailbox.toString()).to.eql(mailbox.emailAddress);
  });

  test('should send and receive an email', async () => {
    const attachmentFilename = 'README.md';
    // Mailslurp automatically modifies filename and adds dynamic characters. Therefore we need RegExp here.
    const attachmentRegexp = 'README.*\.md';

    const mailbox = await I.haveNewMailbox();
    const fileBase64Encoded = await fs.promises.readFile(attachmentFilename, { encoding: 'base64' });
    const [ attachmentId ] = await I.mailslurp.uploadAttachment({
      base64Contents: fileBase64Encoded,
      contentType: 'text/plain',
      filename: attachmentFilename,
    });
    await I.sendEmail({
      to: [mailbox.emailAddress],
      subject: 'Hello Test',
      body: 'Testing',
      attachments: [ attachmentId ]
    });
    const email = await I.waitForLatestEmail(50);
    expect(email.body.trim()).to.eql('Testing');
    await I.seeInEmailSubject('Hello');
    await I.seeEmailSubjectEquals('Hello Test');
    await I.seeEmailIsFrom(mailbox.emailAddress);
    await I.seeInEmailBody('Testing');
    await I.dontSeeInEmailBody('Email');
    await I.dontSeeInEmailSubject('Bye');
    await I.seeNumberOfEmailAttachments(1);
    await I.seeEmailAttachment(attachmentRegexp);
  });


  test('should send an email', async () => {
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