const createMockResponse = () => ({
  code: 0,
  data: {
    ipad_upper_sections: [
      { id: 751 }
    ]
  }
});

console.log(JSON.stringify(createMockResponse()));
