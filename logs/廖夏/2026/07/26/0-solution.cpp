#include<iostream>
#include<cstdio>
using namespace std;
int a[25];
int popcount(int value) {
    int count = 0;
    while (value) {
        count += value & 1;
        value >>= 1;
    }
    return count;
}
bool is_prime(int x){
    for (int i = 2; i * i < x; i++){
        if (x % i == 0) return false;
    }
    return true;
}
int main(){
    int ans = 0;
    int n, k; cin >> n >> k;
    for (int i = 0; i < n; i++){
        cin >> a[i];
    }
    int U = 1 << n; // 不是 n - 1 是为了实现下面不用左移减一
    for (int S = 0; S < U; S++){
        if (popcount(S) == k){
            int sum = 0;
            for (int i = 0; i < n; i++)
                if (S & (1 << i)) sum += a[i];
            if (is_prime(sum)) ans++;    
        }
    }
    cout << ans;
}