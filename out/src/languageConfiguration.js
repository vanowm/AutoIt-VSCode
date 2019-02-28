const languageConfiguration = {
  indentationRules: {
    increaseIndentPattern: /^\s*(For|Func|If|ElseIf|Else|Select|While|Case|Switch|With)\b/i,
    decreaseIndentPattern: /^\s*(Next|EndFunc|EndIf|ElseIf|Else|EndSelect|EndSwitch|WEnd|EndWith)\b/i,
  },
  wordPattern: /([$@#]?[A-Za-z_]\w+)/,

}

module.exports = languageConfiguration