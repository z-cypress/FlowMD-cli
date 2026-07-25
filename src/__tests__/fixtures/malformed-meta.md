# Document with Malformed Metadata

## Block with missing closing brace

```ai {model: gpt-4o, output: summary
This should still work with empty meta.
```

## Block with no metadata

```ai
Simple AI block without metadata.
```

## Block with extra spaces

```data   {  from:   "default"  ,  output:   "result"  }
SELECT * FROM users
```
