# node-pkware

sources:

* https://github.com/ladislav-zezula/StormLib/tree/master/src/pklib
* https://github.com/ShieldBattery/implode-decoder

helpful links:

* https://stackoverflow.com/questions/2094666/pointers-in-c-when-to-use-the-ampersand-and-the-asterisk

## Note to self: pointers in C

```c
int value = 12; // set a value to a variable

int *pointerToValue = &value; // get the address for a variable and store it in a pointer

int *anotherPointer = pointerToValue; // copy a pointer

int anoherValue = *pointerToValue; // copy a value through a pointer
```

So the operators are

`&` - get the address of a variable

`*` - get the value of whatever the pointer is pointing to
