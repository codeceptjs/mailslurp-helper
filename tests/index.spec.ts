import nock from 'nock';
require('dotenv').config();
import {expect, test} from '@jest/globals';
import MailSlurp = require("../src");
import fs from 'fs';

const emailObj = {
  id: 'email-id',
  subject: 'Hello Test',
  body: 'Testing',
  from: 'hello@test.de',
  to: ['hello@test.de'],
  attachments: ['mock-attachment-id'],
  createdAt: new Date().toISOString(),
  inboxId: '123',
  emailAddress: 'hello@test.de'
};

// Disable all real network connections
nock.disableNetConnect();

let I;
const endpoint: string = 'https://api.mailslurp.com';
const anotherEndpoint: string = 'https://javascript.api.mailslurp.com';
const attachmentId: string = "1708081636-1c8167ec-a4b5-4117-9c8b-af7c1dcb8076";
const inboxId: string = '123';
const attachmentFilename = 'README.md';

describe('MailSlurp helper', function () {
  beforeAll(() => {
    // Register specific POST /inboxes mock for both endpoints
    nock(endpoint).persist().post('/inboxes').reply(200, {id: '123', emailAddress: 'hello@test.de'});
    nock(anotherEndpoint).persist().post('/inboxes').reply(200, {id: '123', emailAddress: 'hello@test.de'});
    // Attachment upload endpoint
    nock(endpoint).persist().post(/\/attachments/).reply(200, ['mock-attachment-id']);
    nock(anotherEndpoint).persist().post(/\/attachments/).reply(200, ['mock-attachment-id']);
    // Wait for email endpoints (POST and GET)
    nock(endpoint).persist().post(/\/waitForLatestEmail/).reply(200, emailObj);
    nock(endpoint).persist().get(/\/waitForLatestEmail/).reply(200, emailObj);
    nock(anotherEndpoint).persist().post(/\/waitForLatestEmail/).reply(200, emailObj);
    nock(anotherEndpoint).persist().get(/\/waitForLatestEmail/).reply(200, emailObj);
    nock(endpoint).persist().post(/\/waitForMatchingEmails/).reply(200, [emailObj]);
    nock(endpoint).persist().get(/\/waitForMatchingEmails/).reply(200, [emailObj]);
    nock(anotherEndpoint).persist().post(/\/waitForMatchingEmails/).reply(200, [emailObj]);
    nock(anotherEndpoint).persist().get(/\/waitForMatchingEmails/).reply(200, [emailObj]);
    // Email metadata endpoints - MailSlurp uses /emails/{emailId}/attachments/{attachmentId}/metadata
    nock(endpoint).persist().get(/\/emails\/[\w-]+\/attachments\/[\w-]+\/metadata/).reply(200, { 
      name: 'README.md', 
      contentType: 'text/plain',
      contentLength: 1234,
      attachmentId: 'mock-attachment-id' 
    });
    nock(anotherEndpoint).persist().get(/\/emails\/[\w-]+\/attachments\/[\w-]+\/metadata/).reply(200, { 
      name: 'README.md', 
      contentType: 'text/plain',
      contentLength: 1234,
      attachmentId: 'mock-attachment-id' 
    });
    nock(endpoint).persist().get(/\/emails\/[\w-]+$/).reply(200, emailObj);
    nock(anotherEndpoint).persist().get(/\/emails\/[\w-]+$/).reply(200, emailObj);
    // Catch-all for any unmocked requests to MailSlurp API (both endpoints) - more specific patterns
    nock(endpoint).persist().defaultReplyHeaders({ 'Content-Type': 'application/json' });
    nock(endpoint).persist().get(/^(?!.*\/(waitForLatestEmail|waitForMatchingEmails|emails\/[\w-]+$|emails\/[\w-]+\/attachments)).*/).reply(200, {});
    nock(endpoint).persist().post(/^(?!.*\/(inboxes$|attachments$|waitForLatestEmail|waitForMatchingEmails)).*/).reply(200, {});
    nock(anotherEndpoint).persist().delete(/.*/).reply(200, {});
    nock(anotherEndpoint).persist().defaultReplyHeaders({ 'Content-Type': 'application/json' });
    nock(anotherEndpoint).persist().get(/^(?!.*\/(waitForLatestEmail|waitForMatchingEmails|emails\/[\w-]+$|emails\/[\w-]+\/attachments)).*/).reply(200, {});
    nock(anotherEndpoint).persist().post(/^(?!.*\/(inboxes$|attachments$|waitForLatestEmail|waitForMatchingEmails)).*/).reply(200, {});
    nock(anotherEndpoint).persist().delete(/.*/).reply(200, {});
  });

  // Removed nock.cleanAll() to keep persistent mocks active

  beforeEach(() => {
    I = new MailSlurp({ apiKey: 'someApiKey' });

    // Mock for both endpoints - only essential ones, avoid conflicts with beforeAll
    [endpoint, 'https://javascript.api.mailslurp.com'].forEach(api => {
      nock(api).persist().delete(new RegExp(`/inboxes/\w+`)).reply(203);
      nock(api).persist().post(new RegExp(`/inboxes/\w+`)).reply(200, { to :["hello@test.de"], subject: "Hello Test", body: "Testing", attachments:[attachmentId] });
      nock(api).persist().post(new RegExp(`/inboxes/\w+/confirm`)).reply(200, (uri, requestBody) => {
        const body = typeof requestBody === 'string' ? JSON.parse(requestBody) : requestBody;
        return {
          id: inboxId,
          to: body.to || ["hello@test.de"],
          subject: body.subject || "Hello Test",
          body: body.body || "Testing",
          attachments: body.attachments || [attachmentId]
        };
      });
      nock(api).persist().get(new RegExp(`/inboxes/\w+`)).reply(200, { id: inboxId, emailAddress: 'hello@test.de' });
    });
  });

  beforeEach(async () => I._before());
  afterEach(async () => I._after());

  test('should create an inbox', async () => {
    const mailbox = await I.haveNewMailbox();
    expect(mailbox.id).toBe('123');
    expect(mailbox.emailAddress).toBe('hello@test.de');
    expect(mailbox.toString()).toEqual(mailbox.emailAddress);
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
    expect(email.body.trim()).toEqual('Testing');
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
    
    // The waitForEmailMatching will use the persistent mocks from beforeAll
    // which should return emailObj with 'Testing' body
    const email = await I.waitForEmailMatching({
      subject: 'Hello'
    });
    
    // Since the persistent mock returns emailObj, this should work
    expect(email.body.trim()).toEqual('Testing');
    await I.seeInEmailSubject('Hello');
    await I.seeEmailSubjectEquals('Hello Test');
  }, 10000);
});
