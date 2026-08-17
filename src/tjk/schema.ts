export const tjkProgramSchema = {
  type:"object", properties:{ meetings:{ type:"array", items:{ type:"object", properties:{
    city:{type:"string"}, races:{type:"array",items:{type:"object",properties:{
      raceNumber:{type:"integer"}, time:{anyOf:[{type:"string"},{type:"null"}]},
      distanceMeters:{anyOf:[{type:"integer"},{type:"null"}]}, track:{anyOf:[{type:"string"},{type:"null"}]},
      runners:{type:"array",items:{type:"object",properties:{number:{type:"integer"},name:{type:"string"},
        jockey:{anyOf:[{type:"string"},{type:"null"}]},weight:{anyOf:[{type:"number"},{type:"null"}]},
        hp:{anyOf:[{type:"integer"},{type:"null"}]},agfPercent:{anyOf:[{type:"number"},{type:"null"}]}}
        ,required:["number","name","jockey","weight","hp","agfPercent"]}}
    },required:["raceNumber","time","distanceMeters","track","runners"]}}
  },required:["city","races"]}}}, required:["meetings"]
} as const;
