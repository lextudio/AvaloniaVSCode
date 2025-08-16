const path = require('path');
const fs = require('fs');
const vscodeTextmate = require('vscode-textmate');
const oniguruma = require('vscode-oniguruma');

function loadOnigLib() {
  return oniguruma.loadWASM(
    fs.readFileSync(require.resolve('vscode-oniguruma/release/onig.wasm')).buffer
  ).then(() => {
    return {
      createOnigScanner(patterns) {
        return new oniguruma.OnigScanner(patterns);
      },
      createOnigString(s) {
        return new oniguruma.OnigString(s);
      }
    };
  });
}

describe('AXAML.tmLanguage.json', () => {
  let grammar;
  beforeAll(async () => {
    const grammarPath = path.join(__dirname, '../AXAML.tmLanguage.json');
    const grammarContent = fs.readFileSync(grammarPath, 'utf8');
    const registry = new vscodeTextmate.Registry({
      onigLib: await loadOnigLib(),
      loadGrammar: async () => JSON.parse(grammarContent)
    });
    grammar = await registry.loadGrammar('source.axaml');
  });

  it('tokenizes a simple AXAML tag', () => {
    const line = '<Button Content="Click" />';
    const result = grammar.tokenizeLine(line);
    expect(result.tokens.length).toBeGreaterThan(0);

    // Check all tokens: text and scopes
    const expected = [
      {text: '<', scopes: ['meta.tag.xml', 'punctuation.definition.tag.xml']},
      {text: 'Button', scopes: ['meta.tag.xml', 'entity.name.tag.localname.xml']},
      {text: ' ', scopes: ['meta.tag.xml']},
      {text: 'Content', scopes: ['meta.tag.xml', 'entity.other.attribute-name.localname.xml']},
      {text: '=', scopes: ['meta.tag.xml', 'punctuation.separator.key-value.xml']},
      {text: '"', scopes: ['meta.tag.xml', 'string.quoted.double.xml', 'punctuation.definition.string.begin.xml']},
      {text: 'Click', scopes: ['meta.tag.xml', 'string.quoted.double.xml']},
      {text: '"', scopes: ['meta.tag.xml', 'string.quoted.double.xml', 'punctuation.definition.string.end.xml']},
      {text: ' ', scopes: ['meta.tag.xml']},
      {text: '/>', scopes: ['meta.tag.xml', 'punctuation.definition.tag.xml']}
    ];

    // Compare each token's text and scopes
    for (let i = 0; i < expected.length; i++) {
      const token = result.tokens[i];
      const tokenText = line.slice(token.startIndex, result.tokens[i+1] ? result.tokens[i+1].startIndex : line.length);
      expect(tokenText).toBe(expected[i].text);
      expected[i].scopes.forEach(scope => {
        expect(token.scopes).toContain(scope);
      });
    }
  });

    it('tokenizes a tag with namespace', () => {
      const line = '<avalonia:Button Content="Click" />';
      const result = grammar.tokenizeLine(line);
      expect(result.tokens.length).toBeGreaterThan(0);

      const expected = [
        {text: '<', scopes: ['meta.tag.xml', 'punctuation.definition.tag.xml']},
        {text: 'avalonia', scopes: ['meta.tag.xml', 'entity.name.tag.namespace.xml']},
        {text: ':', scopes: ['meta.tag.xml', 'punctuation.separator.namespace.xml']},
        {text: 'Button', scopes: ['meta.tag.xml', 'entity.name.tag.localname.xml']},
        {text: ' ', scopes: ['meta.tag.xml']},
        {text: 'Content', scopes: ['meta.tag.xml', 'entity.other.attribute-name.localname.xml']},
        {text: '=', scopes: ['meta.tag.xml', 'punctuation.separator.key-value.xml']},
        {text: '"', scopes: ['meta.tag.xml', 'string.quoted.double.xml', 'punctuation.definition.string.begin.xml']},
        {text: 'Click', scopes: ['meta.tag.xml', 'string.quoted.double.xml']},
        {text: '"', scopes: ['meta.tag.xml', 'string.quoted.double.xml', 'punctuation.definition.string.end.xml']},
        {text: ' ', scopes: ['meta.tag.xml']},
        {text: '/>', scopes: ['meta.tag.xml', 'punctuation.definition.tag.xml']}
      ];

      for (let i = 0; i < expected.length; i++) {
        const token = result.tokens[i];
        const tokenText = line.slice(token.startIndex, result.tokens[i+1] ? result.tokens[i+1].startIndex : line.length);
        expect(tokenText).toBe(expected[i].text);
        expected[i].scopes.forEach(scope => {
          expect(token.scopes).toContain(scope);
        });
      }
    });

    it('tokenizes an attribute', () => {
    const line = '<Button IsEnabled="True" />';
    const result = grammar.tokenizeLine(line);
    const expected = [
      {text: '<', scopes: ['meta.tag.xml', 'punctuation.definition.tag.xml']},
      {text: 'Button', scopes: ['meta.tag.xml', 'entity.name.tag.localname.xml']},
      {text: ' ', scopes: ['meta.tag.xml']},
      {text: 'IsEnabled', scopes: ['meta.tag.xml', 'entity.other.attribute-name.localname.xml']},
      {text: '=', scopes: ['meta.tag.xml', 'punctuation.separator.key-value.xml']},
      {text: '"', scopes: ['meta.tag.xml', 'string.quoted.double.xml', 'punctuation.definition.string.begin.xml']},
      {text: 'True', scopes: ['meta.tag.xml', 'string.quoted.double.xml']},
      {text: '"', scopes: ['meta.tag.xml', 'string.quoted.double.xml', 'punctuation.definition.string.end.xml']},
      {text: ' ', scopes: ['meta.tag.xml']},
      {text: '/>', scopes: ['meta.tag.xml', 'punctuation.definition.tag.xml']}
    ];

    for (let i = 0; i < expected.length; i++) {
      const token = result.tokens[i];
      const tokenText = line.slice(token.startIndex, result.tokens[i+1] ? result.tokens[i+1].startIndex : line.length);
      expect(tokenText).toBe(expected[i].text);
      expected[i].scopes.forEach(scope => {
        expect(token.scopes).toContain(scope);
      });
    }
    });

    it('tokenizes a comment', () => {
      const line = '<!-- This is a comment -->';
      const result = grammar.tokenizeLine(line);
      const expected = [
        {text: '<!--', scopes: ['comment.block.xml', 'punctuation.definition.comment.xml']},
        {text: ' This is a comment ', scopes: ['comment.block.xml']},
        {text: '-->', scopes: ['comment.block.xml', 'punctuation.definition.comment.xml']}
      ];

      for (let i = 0; i < expected.length; i++) {
        const token = result.tokens[i];
        const tokenText = line.slice(token.startIndex, result.tokens[i+1] ? result.tokens[i+1].startIndex : line.length);
        expect(tokenText).toBe(expected[i].text);
        expected[i].scopes.forEach(scope => {
          expect(token.scopes).toContain(scope);
        });
      }
    });

    it('tokenizes CDATA section', () => {
      const line = '<![CDATA[Some <AXAML> content]]>';
      const result = grammar.tokenizeLine(line);
      const expected = [
        {text: '<![CDATA[', scopes: ['string.unquoted.cdata.xml', 'punctuation.definition.string.begin.xml']},
        {text: 'Some <AXAML> content', scopes: ['string.unquoted.cdata.xml']},
        {text: ']]>', scopes: ['string.unquoted.cdata.xml', 'punctuation.definition.string.end.xml']}
      ];

      for (let i = 0; i < expected.length; i++) {
        const token = result.tokens[i];
        const tokenText = line.slice(token.startIndex, result.tokens[i+1] ? result.tokens[i+1].startIndex : line.length);
        expect(tokenText).toBe(expected[i].text);
        expected[i].scopes.forEach(scope => {
          expect(token.scopes).toContain(scope);
        });
      }
    });
});