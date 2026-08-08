#include<iostream>
using namespace std;
bool is_prime(int x)
{
    if(x<2)return false;
    for(int i=2;i*i<=x;i++)
    {
        if(x%i==0)return false;
    }
    return true;
}
int main()
{
    int t;
    cin>>t;
    while(t--)
    {
        int n;cin>>n;
        if(is_prime(n+1))cout<<"YES"<<endl;
        else cout<<"NO"<<endl;
    }
    return 0;
}