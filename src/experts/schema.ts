export const expertSchema={type:"object",properties:{picks:{type:"array",items:{type:"object",properties:{
 city:{type:"string"},raceNumber:{type:"integer"},horseNumber:{type:"integer"},horseName:{type:"string"},
 comment:{anyOf:[{type:"string"},{type:"null"}]},isFavorite:{type:"boolean"},isBanko:{type:"boolean"},isStrong:{type:"boolean"},isStar:{type:"boolean"},
 sourceRank:{anyOf:[{type:"integer"},{type:"null"}]},confidence:{type:"number"}},required:["city","raceNumber","horseNumber","horseName","comment","isFavorite","isBanko","isStrong","isStar","sourceRank","confidence"]}}},required:["picks"]} as const;
