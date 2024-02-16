require('dotenv').config();
import { expect } from 'chai';
import MailSlurp = require("../src");
import fs from 'fs';
import nock from 'nock';

let I;
const endpoint: string = 'https://api.mailslurp.com';
const attachmentId: string = "1708081636-1c8167ec-a4b5-4117-9c8b-af7c1dcb8076";
const inboxId: string = '123';
const attachmentFilename = 'README.md';

describe('MailSlurp helper', function () {

  beforeEach(() => {
    I = new MailSlurp({ apiKey: 'someApiKey' });

    nock(endpoint).post('/inboxes').reply(200, {id: '123', emailAddress: 'hello@test.de'});
    nock(endpoint).delete(`/inboxes/${inboxId}`).reply(203);
    nock(endpoint).post(`/inboxes/${inboxId}`).reply(200, { to :["hello@test.de"], "subject": "Hello Test", "body": "Testing", "attachments":[`${attachmentId}`]});
    nock(endpoint).post('/attachments').reply(200, [ `${attachmentId}` ]);
    nock(endpoint).get(`/waitForLatestEmail?inboxId=${inboxId}&timeout=50000`).reply(200, { id: "123", from: "hello@test.de", to :["hello@test.de"], "subject": "Hello Test", "body": "Testing", "attachments":[`${attachmentId}`]});
    nock(endpoint).get(`/emails/${inboxId}/attachments/${attachmentId}/metadata`).reply(200, { name: 'README.md' });
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
    // Mailslurp automatically modifies filename and adds dynamic characters. Therefore, we need RegExp here.
    const attachmentRegexp = 'README.*.md';

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
    nock(endpoint).post(`/inboxes/${inboxId}`).reply(200, { to :["hello@test.de"], subject: "Another Message", "body": "Should be received" });
    await I.sendEmail({
      to: [mailbox.emailAddress],
      subject: 'Another Message',
      body: 'Should be received'
    });
    nock(endpoint).post(`/waitForMatchingEmails?count=1&inboxId=${inboxId}&timeout=10000`).reply(200, [
      {
        id: 'da810e5c',
        subject: 'Hello Test',
        to: [ 'hello@test.de' ],
        from: '3abb3d8f-f168-43dd-965c-22adfc9b3b20@mailslurp.com',
      },
      {
        id: '49a56c6391dc',
        subject: 'Another Message',
        to: [ 'hello@test.de' ],
        from: '3abb3d8f-f168-43dd-965c-22adfc9b3b20@mailslurp.com',
      }
    ] );
    nock(endpoint).get(`/emails/da810e5c`).reply(200, { subject: 'Hello Test', body: 'Testing' });
    nock(endpoint).get(`/emails/49a56c6391dc`).reply(200, { subject: 'Another Message', body: 'Should be received' });
    const email = await I.waitForEmailMatching({
      subject: 'Hello'
    });
    expect(email.body.trim()).to.eql('Testing');
    await I.seeInEmailSubject('Hello');
    await I.seeEmailSubjectEquals('Hello Test');
  }, 10000);
});
