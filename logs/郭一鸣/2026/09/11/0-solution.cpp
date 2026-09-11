#include<iostream>
using namespace std;
void dfs(int n)
{
    int times=0,pows=1;
    while(pows*2<=n)
    {
        pows*=2;
        times++;
    }
    bool fla=true;
    while(times>=0)
    {
        if(n>=pows)
        {
            if(!fla)cout<<"+";
            fla=false;
            if(times==0)cout<<"2(0)";
            else if(times==1)cout<<"2";
            else{
                cout<<"2(";
                dfs(times);
                cout<<")";
            }
            n-=pows;
        }
        pows/=2;
        times--;
    }
}
int main()
{
    int n;cin>>n;
    dfs(n);
    cout<<endl;
    return 0;
}