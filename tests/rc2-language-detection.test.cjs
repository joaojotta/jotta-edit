'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
test('RC2 unsaved content uses conservative language detection', async () => {
  const {detectLanguage}=await import('../src/language-detection.js');
  for (const [content,expected] of [
    ['body {\n  background-color: #ffc107;\n}', 'css'],
    ['<?php echo 42; ?>','php'],
    ['<!DOCTYPE html><html><body></body></html>','html'],
    ['{ "name": "demo", "active": true }','json'],
    ['const x = 42;', 'javascript'],
    ['def greet(name):\n    print(name)', 'python'],
    ['# Title\nSomething', 'markdown'],
    ['Hello world!', null]
  ]) assert.equal(detectLanguage(content),expected, content);
});
