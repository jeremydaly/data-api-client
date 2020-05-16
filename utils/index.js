const snakeToCamel = (value) =>  value.replace(
  /([-_][a-z])/g,
  (group) => group.toUpperCase().replace('-', '').replace('_', ''),
)

module.exports = {
  snakeToCamel,
}