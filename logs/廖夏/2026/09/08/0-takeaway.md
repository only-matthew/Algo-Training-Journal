两种二分模板
```cpp
while (l + 1 < r)
{
    int mid = l + (r - l) / 2;

    if (P(mid))
        l = mid;
    else
        r = mid;
}
```

```cpp
```cpp
while (l < r)
{
    int mid = l + (r - l + 1) / 2;

    if (P(mid))
        l = mid;
    else
        r = mid -1;
}
```